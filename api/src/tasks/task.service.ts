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
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskOutcomeDto } from './dto/update-task-outcome.dto';
import { MANUAL_TASK_PLACEHOLDER_AUDIO_URL } from './constants/task.constants';
import { Logger } from 'nestjs-pino';

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
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
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
    let createdTaskId: string | undefined;

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

    if (!createdTaskId) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not created', 500);
    }

    const task = await this.taskRepo.findByIdWithMeetingAndProject(createdTaskId);
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
      .catch((err) => {
        // Log the error but don't fail the request
        this.logger.error(
          `Failed to log activity for task creation: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { taskId: task.id, projectId: body.projectId, userId },
        );
      });

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
        .catch((err) => {
          this.logger.error(
            `Failed to send notification for task assignment: ${
              err instanceof Error ? err.message : String(err)
            }`,
            { userId: body.assigneeId, taskId: task.id, projectId: body.projectId },
          );
        });
    }

    return task;
  }

  /**
   * Combined: edit draft (title/description) and/or set outcome (APPROVED / REJECTED).
   * Only the assigned developer can call.
   * - Approve: optional title/description in the same request are applied first (final draft), then status is set to APPROVED and Jira is enqueued. The task must have a title (existing or in this request). We never update the task body after it is approved/synced.
   * - Decline: set status REJECTED.
   * - Draft only: send title/description when status is SENT_TO_DEVELOPER and not yet synced.
   */
  async updateTaskOutcome(taskId: string, userId: string, body: UpdateTaskOutcomeDto) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    if (task.assigneeId !== userId) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only the assigned developer can update draft or set outcome',
        403,
      );
    }

    const hasStatus = body.status === 'APPROVED' || body.status === 'REJECTED';
    const hasDraft =
      (body.title !== undefined && body.title !== '') || body.description !== undefined;
    if (!hasStatus && !hasDraft) {
      return task;
    }

    if (hasStatus) {
      if (body.status === 'APPROVED') {
        if (!TaskStateMachine.canTransition(task.status, TaskStatus.APPROVED)) {
          throw new AppException(
            ErrorCode.INVALID_STATE,
            `Cannot approve from ${task.status}`,
            400,
          );
        }
        // Apply optional final draft in the same request (before status change). We never update body after approving.
        const updateData: { title?: string; description?: string | null } = {};
        if (!task.jiraIssueKey) {
          if (body.title?.trim()) updateData.title = body.title.trim();
          if (body.description !== undefined) updateData.description = body.description;
        }
        if (Object.keys(updateData).length > 0) {
          await this.prisma.task.update({
            where: { id: taskId },
            data: updateData,
          });
        }
        const taskAfterDraft = await this.prisma.task.findUnique({
          where: { id: taskId },
          select: { title: true },
        });
        const effectiveTitle = (updateData.title ?? taskAfterDraft?.title ?? task.title)?.trim();
        if (!effectiveTitle) {
          throw new AppException(
            ErrorCode.VALIDATION_ERROR,
            'Task must have a title before approving (set draft first or send title in this request)',
            400,
          );
        }
        const approvedTask = await this.taskRepo.updateStatus(taskId, TaskStatus.APPROVED);
        const finalTask = await this.taskRepo.findByIdWithMeetingAndProject(taskId);
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
        this.activityLog
          .log({
            projectId: task.meeting.projectId,
            userId,
            action: 'task.approved',
            entityType: 'Task',
            entityId: taskId,
            metadata: { title: finalTask?.title ?? task.title },
          })
          .catch((err) => {
            this.logger.error(
              `Failed to log activity for task approval: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { taskId, projectId: task.meeting.projectId, userId },
            );
          });
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
            .catch((err) => {
              this.logger.error(
                `Failed to send notification for task approval: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { userId: ownerId, taskId, projectId: task.meeting.projectId },
              );
            });
        }
        return finalTask ?? approvedTask;
      }
      if (body.status === 'REJECTED') {
        if (!TaskStateMachine.canTransition(task.status, TaskStatus.REJECTED)) {
          throw new AppException(
            ErrorCode.INVALID_STATE,
            `Cannot decline from ${task.status}`,
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
        this.activityLog
          .log({
            projectId: task.meeting.projectId,
            userId,
            action: 'task.declined',
            entityType: 'Task',
            entityId: taskId,
            metadata: { title: task.title },
          })
          .catch((err) => {
            this.logger.error(
              `Failed to log activity for task decline: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { taskId, projectId: task.meeting.projectId, userId },
            );
          });
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
            .catch((err) => {
              this.logger.error(
                `Failed to send notification for task decline: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { userId: ownerId, taskId, projectId: task.meeting.projectId },
              );
            });
        }
        return result;
      }
    }

    if (hasDraft && !hasStatus) {
      if (task.status !== TaskStatus.SENT_TO_DEVELOPER) {
        throw new AppException(
          ErrorCode.INVALID_STATE,
          `Cannot edit draft when status is ${task.status}`,
          400,
        );
      }
      if (task.jiraIssueKey) {
        throw new AppException(
          ErrorCode.INVALID_STATE,
          'Task is already synced to Jira; cannot edit draft',
          400,
        );
      }
      const title = body.title?.trim();
      const description = body.description;
      const updated = await this.prisma.task.update({
        where: { id: taskId },
        data: {
          ...(title ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
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
        .catch((err) => {
          this.logger.error(
            `Failed to log activity for task draft update: ${
              err instanceof Error ? err.message : String(err)
            }`,
            { taskId, projectId: task.meeting.projectId, userId },
          );
        });
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

    return task;
  }

  /**
   * Reassign or unassign a task. Allowed: Scrum Master or current assignee.
   * assigneeId null/undefined = unassign (status EXTRACTED).
   */
  async reassignTask(
    taskId: string,
    currentUser: CurrentUserType,
    assigneeId: string | null | undefined,
  ) {
    const task = await this.taskRepo.findByIdWithMeetingAndProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    const isSm = currentUser.role === Role.SCRUM_MASTER;
    const isCurrentAssignee = task.assigneeId === currentUser.userId;
    if (!isSm && !isCurrentAssignee) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Master or current assignee can reassign or unassign',
        403,
      );
    }

    if (assigneeId === undefined || assigneeId === null || assigneeId === '') {
      if (!TaskStateMachine.canTransition(task.status, TaskStatus.EXTRACTED)) {
        throw new AppException(ErrorCode.INVALID_STATE, `Cannot unassign from ${task.status}`, 400);
      }
      const result = await this.taskRepo.clearAssigneeAndStatus(taskId, TaskStatus.EXTRACTED);
      this.realtime.emitToProject(task.meeting.projectId, 'task.updated', {
        taskId,
        projectId: task.meeting.projectId,
        status: result.status,
        assigneeId: null,
        updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
      });
      this.activityLog
        .log({
          projectId: task.meeting.projectId,
          userId: currentUser.userId,
          action: 'task.unassigned',
          entityType: 'Task',
          entityId: taskId,
          metadata: { title: task.title },
        })
        .catch((err) => {
          this.logger.error(
            `Failed to log activity for task unassignment: ${
              err instanceof Error ? err.message : String(err)
            }`,
            { taskId, projectId: task.meeting.projectId, userId: currentUser.userId },
          );
        });
      return result;
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.SENT_TO_DEVELOPER)) {
      throw new AppException(ErrorCode.INVALID_STATE, `Cannot assign from ${task.status}`, 400);
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
    this.activityLog
      .log({
        projectId: task.meeting.projectId,
        userId: currentUser.userId,
        action: 'task.assigned',
        entityType: 'Task',
        entityId: taskId,
        metadata: { title: task.title, assigneeId },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to log activity for task assignment: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { taskId, projectId: task.meeting.projectId, userId: currentUser.userId },
        );
      });
    this.notification
      .notify({
        userId: assigneeId,
        type: 'task_assigned',
        title: `New task: ${task.title}`,
        body: `You have been assigned the task "${task.title}".`,
        metadata: { taskId, projectId: task.meeting.projectId },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to send notification for task assignment: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { userId: assigneeId, taskId, projectId: task.meeting.projectId },
        );
      });
    return result;
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

  /**
   * Unified list: filter by projectId, meetingId, and/or assigneeId (resolved; use "me" for current user).
   * When filtering by another user's assigneeId, projectId or meetingId is required.
   */
  async getTasks(
    userId: string,
    query: {
      projectId?: string;
      meetingId?: string;
      assigneeId?: string;
      status?: TaskStatus;
      page?: number;
      limit?: number;
    },
  ) {
    const { projectId, meetingId, assigneeId, status, page = 1, limit = 20 } = query;
    if (!projectId && !meetingId && !assigneeId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Provide at least one of projectId, meetingId, or assigneeId (use assigneeId=me for current user)',
        400,
      );
    }
    if (assigneeId && assigneeId !== userId && !projectId && !meetingId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        "When filtering by another user's assigneeId, projectId or meetingId is required",
        400,
      );
    }
    if (projectId) {
      const isOwner = await this.projectRepo.isOwner(projectId, userId);
      const isMember = await this.projectRepo.isMember(projectId, userId);
      if (!isOwner && !isMember) {
        throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this project', 403);
      }
    }
    if (meetingId) {
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
    }
    const filters: TaskFilters = {};
    if (projectId) filters.projectId = projectId;
    if (meetingId) filters.meetingId = meetingId;
    if (assigneeId) filters.assigneeId = assigneeId;
    if (status) filters.status = status;
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
    const completedStatuses: TaskStatus[] = [
      TaskStatus.APPROVED,
      TaskStatus.REJECTED,
      TaskStatus.SYNCED,
    ];

    const active = all
      .filter((t) => activeStatuses.includes(t.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const completed = all
      .filter((t) => completedStatuses.includes(t.status))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return { active, completed };
  }
}
