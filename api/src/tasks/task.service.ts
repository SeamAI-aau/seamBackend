import { Injectable, Inject } from '@nestjs/common';
import type { ITaskRepository, TaskFilters, TaskWithMeetingProject } from './types/task.repository';
import { TASK_REPOSITORY } from './types/task.tokens';
import { TaskStateMachine } from './task-state-machine';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { TaskStatus, Role } from '@prisma/client';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';
import type { IProjectRepository } from '../project/types/project.repository';
import { JiraSyncQueue } from '../integrations/jira/queue/jira-sync.queue';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeService } from '../infrastracture/realtime/realtime.service';
import { JiraService } from '../integrations/jira/jira.service';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import type { UpdateJiraIssueDto } from './dto/update-jira-issue.dto';
import type { UpdateTaskDraftDto } from './dto/update-task-draft.dto';
import type { CreateTaskDto } from './dto/create-task.dto';
import { MANUAL_TASK_PLACEHOLDER_AUDIO_URL } from './constants/task.constants';

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly jiraSyncQueue: JiraSyncQueue,
    private readonly activityLog: ActivityLogService,
    private readonly notification: NotificationService,
    private readonly realtime: RealtimeService,
    private readonly jira: JiraService,
    private readonly prisma: PrismaService,
  ) {}

  async createTask(userId: string, body: CreateTaskDto): Promise<TaskWithMeetingProject> {
    const project = await this.projectRepo.findById(body.projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(body.projectId, userId);
    const isMember = await this.projectRepo.isMember(body.projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this project', 403);
    }

    const status = body.assigneeId ? TaskStatus.SENT_TO_DEVELOPER : TaskStatus.EXTRACTED;
    let createdTaskId: string;

    await this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          title: 'Manual task',
          audioUrl: MANUAL_TASK_PLACEHOLDER_AUDIO_URL,
          projectId: body.projectId,
          createdById: userId,
        },
      });
      const transcript = await tx.transcript.create({
        data: {
          meetingId: meeting.id,
          version: 1,
          content: '',
          diarization: {},
        },
      });
      const task = await tx.task.create({
        data: {
          meetingId: meeting.id,
          transcriptId: transcript.id,
          title: body.title,
          description: body.description ?? null,
          status,
          assigneeId: body.assigneeId ?? null,
        },
      });
      createdTaskId = task.id;
    });

    const task = await this.taskRepo.findByIdWithMeetingAndProject(createdTaskId!);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    this.realtime.emitToProject(body.projectId, 'task.created', {
      taskId: task.id,
      projectId: body.projectId,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId ?? null,
    });

    this.activityLog
      .log({
        projectId: body.projectId,
        userId,
        action: 'task.created',
        entityType: 'Task',
        entityId: task.id,
        metadata: { title: task.title },
      })
      .catch(() => {});

    if (body.assigneeId) {
      this.realtime.emitToUser(body.assigneeId, 'task.assigned', {
        taskId: task.id,
        projectId: body.projectId,
        title: task.title,
        status: task.status,
      });
      this.notification
        .notify({
          userId: body.assigneeId,
          type: 'task_assigned',
          title: `New task: ${task.title}`,
          body: `You have been assigned the task "${task.title}".`,
          metadata: { taskId: task.id, projectId: body.projectId },
        })
        .catch(() => {});
    }

    return task;
  }

  async approveTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    if (task.assigneeId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only assigned developer can approve', 403);
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.APPROVED)) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Cannot transition from ${task.status} to APPROVED`,
        400,
      );
    }

    const approvedTask = await this.taskRepo.updateStatus(taskId, TaskStatus.APPROVED);
    this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
      taskId,
      projectId: task.meeting.projectId,
      status: approvedTask.status,
      assigneeId: approvedTask.assigneeId ?? null,
      updatedAt: (approvedTask as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });
    if (!approvedTask.jiraIssueKey) {
      await this.jiraSyncQueue.enqueue(task.id);
    }
    this.activityLog.log({
      projectId: task.meeting.projectId,
      userId,
      action: 'task.approved',
      entityType: 'Task',
      entityId: taskId,
      metadata: { title: task.title },
    }).catch(() => {});

    const ownerId = task.meeting.project.ownerId;
    if (ownerId && ownerId !== userId) {
      this.notification
        .notify({
          userId: ownerId,
          type: 'task_approved',
          title: `Task approved: ${approvedTask.title}`,
          body: `A developer approved the task "${approvedTask.title}".`,
          metadata: { taskId, projectId: task.meeting.projectId },
        })
        .catch(() => {});
    }
    return approvedTask;
  }


  async declineTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    if (task.assigneeId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only assigned developer can decline', 403);
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.REJECTED)) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Cannot transition from ${task.status} to REJECTED`,
        400,
      );
    }

    const result = await this.taskRepo.updateStatus(taskId, TaskStatus.REJECTED);
    this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
      taskId,
      projectId: task.meeting.projectId,
      status: result.status,
      assigneeId: result.assigneeId ?? null,
      updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });
    this.activityLog.log({
      projectId: task.meeting.projectId,
      userId,
      action: 'task.declined',
      entityType: 'Task',
      entityId: taskId,
      metadata: { title: task.title },
    }).catch(() => {});

    const ownerId = task.meeting.project.ownerId;
    if (ownerId && ownerId !== userId) {
      this.notification
        .notify({
          userId: ownerId,
          type: 'task_declined',
          title: `Task declined: ${result.title}`,
          body: `A developer declined the task "${result.title}".`,
          metadata: { taskId, projectId: task.meeting.projectId },
        })
        .catch(() => {});
    }
    return result;
  }

  async sendToDeveloper(
    taskId: string,
    currentUser: CurrentUserType,
    assigneeId: string,
  ) {
    if (currentUser.role !== Role.SCRUM_MASTER) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Masters can send tasks to developers',
        403,
      );
    }

    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.SENT_TO_DEVELOPER)) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Cannot transition from ${task.status} to SENT_TO_DEVELOPER`,
        400,
      );
    }

    const result = await this.taskRepo.updateAssigneeAndStatus(
      taskId,
      assigneeId,
      TaskStatus.SENT_TO_DEVELOPER,
    );
    this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
      taskId,
      projectId: task.meeting.projectId,
      status: result.status,
      assigneeId: result.assigneeId ?? assigneeId,
      updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });
    this.realtime.emitToUser(assigneeId, 'task.assigned', {
      taskId,
      projectId: task.meeting.projectId,
      title: task.title,
      status: result.status,
    });
    this.activityLog.log({
      projectId: task.meeting.projectId,
      userId: currentUser.userId,
      action: 'task.assigned',
      entityType: 'Task',
      entityId: taskId,
      metadata: { title: task.title, assigneeId },
    }).catch(() => {});

    this.notification
      .notify({
        userId: assigneeId,
        type: 'task_assigned',
        title: `New task: ${task.title}`,
        body: `You have been assigned the task "${task.title}".`,
        metadata: { taskId, projectId: task.meeting.projectId },
      })
      .catch(() => {});
    return result;
  }

  async unassignTask(
    taskId: string,
    currentUser: CurrentUserType,
  ) {
    if (currentUser.role !== Role.SCRUM_MASTER) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Masters can unassign tasks',
        403,
      );
    }

    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.EXTRACTED)) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Cannot transition from ${task.status} to EXTRACTED`,
        400,
      );
    }

    const result = await this.taskRepo.clearAssigneeAndStatus(taskId, TaskStatus.EXTRACTED);
    this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
      taskId,
      projectId: task.meeting.projectId,
      status: result.status,
      assigneeId: null,
      updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });
    this.activityLog.log({
      projectId: task.meeting.projectId,
      userId: currentUser.userId,
      action: 'task.unassigned',
      entityType: 'Task',
      entityId: taskId,
      metadata: { title: task.title },
    }).catch(() => {});
    return result;
  }

  async updateTaskDraft(taskId: string, userId: string, body: UpdateTaskDraftDto) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    if (task.assigneeId !== userId) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only assigned developer can edit this task', 403);
    }

    if (task.status !== TaskStatus.SENT_TO_DEVELOPER) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        `Cannot edit task draft when status is ${task.status}`,
        400,
      );
    }

    if (task.jiraIssueKey) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        'Task is already synced to Jira; use the Jira update endpoint instead',
        400,
      );
    }

    const title = body.title?.trim();
    const description = typeof body.description === 'string' ? body.description : undefined;
    if (!title && typeof description !== 'string') {
      return task;
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title ? { title } : {}),
        ...(typeof description === 'string' ? { description } : {}),
      },
    });

    this.activityLog
      .log({
        projectId: task.meeting.projectId,
        userId,
        action: 'task.draft.updated',
        entityType: 'Task',
        entityId: taskId,
        metadata: { title: updated.title },
      })
      .catch(() => {});

    this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
      taskId,
      projectId: task.meeting.projectId,
      status: updated.status,
      assigneeId: updated.assigneeId ?? null,
      title: updated.title,
      updatedAt: (updated as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });

    return updated;
  }

  async updateJiraIssue(taskId: string, userId: string, body: UpdateJiraIssueDto) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    const projectId = task.meeting.projectId;
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isAssignee = task.assigneeId === userId;
    if (!isOwner && !isAssignee) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to update this Jira issue', 403);
    }

    if (!task.jiraIssueKey) {
      throw new AppException(
        ErrorCode.INVALID_STATE,
        'Task has not been synced to Jira yet',
        400,
      );
    }

    const ownerId = task.meeting.project.ownerId;
    const { accessToken, cloudId } = await this.jira.getValidAccessToken(ownerId);

    const fields: Record<string, unknown> = {};
    const fieldsChanged: string[] = [];
    if (body.title?.trim()) {
      fields.summary = body.title.trim();
      fieldsChanged.push('summary');
    }
    if (typeof body.description === 'string') {
      fields.description = body.description;
      fieldsChanged.push('description');
    }

    if (fieldsChanged.length === 0) {
      return { success: true, jiraIssueKey: task.jiraIssueKey, fieldsChanged: [] as string[] };
    }

    await axios.put(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${task.jiraIssueKey}`,
      { fields },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(body.title?.trim() ? { title: body.title.trim() } : {}),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
      },
    });

    this.activityLog
      .log({
        projectId,
        userId,
        action: 'jira.issue.updated',
        entityType: 'Task',
        entityId: taskId,
        metadata: { jiraIssueKey: task.jiraIssueKey, fieldsChanged },
      })
      .catch(() => {});

    this.realtime.emitToProject(projectId, 'jira.issueUpdated', {
      taskId,
      projectId,
      jiraIssueKey: task.jiraIssueKey,
      fieldsChanged,
      updatedAt: new Date(),
    });

    return { success: true, jiraIssueKey: task.jiraIssueKey, fieldsChanged };
  }

  async getById(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    const projectId = task.meeting.projectId;
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    const isAssignee = task.assigneeId === userId;

    if (!isOwner && !isMember && !isAssignee) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this task', 403);
    }

    return task;
  }

  async getTasksByProject(
    projectId: string,
    userId: string,
    filters: Omit<TaskFilters, 'projectId'>,
    page = 1,
    limit = 20,
  ) {
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this project', 403);
    }
    const fullFilters: TaskFilters = { ...filters, projectId };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(fullFilters, { skip, take: limit }),
      this.taskRepo.count(fullFilters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getTasksByMeeting(
    meetingId: string,
    userId: string,
    filters: Omit<TaskFilters, 'meetingId'>,
    page = 1,
    limit = 20,
  ) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { projectId: true },
    });
    if (!meeting) {
      throw new AppException(ErrorCode.MEETING_NOT_FOUND, 'Meeting not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(meeting.projectId, userId);
    const isMember = await this.projectRepo.isMember(meeting.projectId, userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this project', 403);
    }
    const fullFilters: TaskFilters = { ...filters, meetingId };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(fullFilters, { skip, take: limit }),
      this.taskRepo.count(fullFilters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getTasksForAssignee(
    userId: string,
    status?: TaskStatus,
    page = 1,
    limit = 20,
  ) {
    const filters = { assigneeId: userId, status };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(filters, { skip, take: limit }),
      this.taskRepo.count(filters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Returns tasks grouped by active (EXTRACTED, SENT_TO_DEVELOPER) vs completed (APPROVED, REJECTED, SYNCED).
   */
  async getMyTasksGrouped(userId: string) {
    const all = await this.taskRepo.findManyWithMeetingAndAssignee(
      { assigneeId: userId },
      { take: 200 },
    );
    const activeStatuses: TaskStatus[] = [TaskStatus.EXTRACTED, TaskStatus.SENT_TO_DEVELOPER];
    const completedStatuses: TaskStatus[] = [TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.SYNCED];

    const active = all
      .filter((t) => activeStatuses.includes(t.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const completed = all
      .filter((t) => completedStatuses.includes(t.status))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return { active, completed };
  }
}
