import { Injectable, Inject } from '@nestjs/common';
import type { ITaskRepository, TaskFilters, TaskWithMeetingAndProject } from './types/task.repository';
import { TASK_REPOSITORY } from './types/task.tokens';
import { TaskStateMachine } from './task-state-machine';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { TaskSource, TaskStatus, Role } from '@prisma/client';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';
import type { IProjectRepository } from '../project/types/project.repository';
import { JiraSyncQueue } from '../integrations/jira/queue/jira-sync.queue';
import { JiraIssueService } from '../integrations/jira/jira-issue.service';
import { JiraSyncService } from '../integrations/jira/jira-sync.service';
import { JiraContextService } from '../integrations/jira/jira-context.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeService } from '../infrastracture/realtime/realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskOutcomeDto } from './dto/update-task-outcome.dto';
import { Logger } from 'nestjs-pino';
import { assertProjectTaskAssignee } from '../project/project-membership.util';
import { getTaskProject, getTaskProjectId } from './utils/task-project.util';

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly jiraSyncQueue: JiraSyncQueue,
    private readonly jiraSyncService: JiraSyncService,
    private readonly jiraIssueService: JiraIssueService,
    private readonly jiraContextService: JiraContextService,
    private readonly activityLog: ActivityLogService,
    private readonly notification: NotificationService,
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createTask(user: CurrentUserType, body: CreateTaskDto): Promise<TaskWithMeetingAndProject> {
    if (user.role !== Role.SCRUM_MASTER) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Masters can create tasks manually',
        403,
      );
    }

    const project = await this.projectRepo.findById(body.projectId);
    if (!project) {
      throw new AppException(ErrorCode.PROJECT_NOT_FOUND, 'Project not found', 404);
    }
    const isOwner = await this.projectRepo.isOwner(body.projectId, user.userId);
    const isMember = await this.projectRepo.isMember(body.projectId, user.userId);
    if (!isOwner && !isMember) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this project', 403);
    }

    if (body.assigneeId) {
      await assertProjectTaskAssignee(this.projectRepo, body.projectId, body.assigneeId);
    }

    const status = body.assigneeId ? TaskStatus.SENT_TO_DEVELOPER : TaskStatus.EXTRACTED;

    const created = await this.prisma.task.create({
      data: {
        projectId: body.projectId,
        createdById: user.userId,
        source: TaskSource.MANUAL,
        title: body.title,
        description: body.description ?? null,
        status,
        assigneeId: body.assigneeId ?? null,
      },
    });

    const task = await this.taskRepo.findByIdWithProject(created.id);
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
        userId: user.userId,
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
          { taskId: task.id, projectId: body.projectId, userId: user.userId },
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
    const task = await this.taskRepo.findByIdWithProject(taskId);
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
        if (body.jiraTransitionId?.trim() && !task.jiraIssueKey) {
          await this.prisma.task.update({
            where: { id: taskId },
            data: { jiraProposalTransitionId: body.jiraTransitionId.trim() },
          });
        }

        const approvedTask = await this.taskRepo.updateStatus(taskId, TaskStatus.APPROVED);
        const finalTask = await this.taskRepo.findByIdWithProject(taskId);
        const projectId = getTaskProjectId(task);
        this.realtime.emitToProject(projectId, 'task.updated', {
          taskId,
          projectId,
          status: approvedTask.status,
          assigneeId: approvedTask.assigneeId ?? null,
          updatedAt: (approvedTask as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
        });
        if (!approvedTask.jiraIssueKey) {
          try {
            const jobId = await this.jiraSyncQueue.enqueue(task.id);
            this.logger.log(
              `[jira-sync] approve enqueue ok taskId=${task.id} projectId=${projectId} jobId=${jobId}`,
            );
          } catch (err) {
            const msg =
              err instanceof Error
                ? `Failed to enqueue Jira sync: ${err.message}`
                : `Failed to enqueue Jira sync: ${String(err)}`;
            await this.taskRepo.setJiraSyncLastError(task.id, msg);
            this.logger.error(
              `[jira-sync] approve enqueue failed taskId=${task.id} projectId=${projectId}: ${msg}`,
              { taskId: task.id, projectId, userId },
            );
          }
        }
        this.activityLog
          .log({
            projectId: getTaskProjectId(task),
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
              { taskId, projectId: getTaskProjectId(task), userId },
            );
          });
        const ownerId = getTaskProject(task).ownerId;
        if (ownerId && ownerId !== userId) {
          this.notification
            .notify({
              userId: ownerId,
              type: 'task_approved',
              title: `Task approved: ${approvedTask.title}`,
              body: `A developer approved the task "${approvedTask.title}".`,
              metadata: { taskId, projectId: getTaskProjectId(task) },
            })
            .catch((err) => {
              this.logger.error(
                `Failed to send notification for task approval: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { userId: ownerId, taskId, projectId: getTaskProjectId(task) },
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
        this.realtime.emitToProject(getTaskProjectId(task), 'task.updated', {
          taskId,
          projectId: getTaskProjectId(task),
          status: result.status,
          assigneeId: result.assigneeId ?? null,
          updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
        });
        this.activityLog
          .log({
            projectId: getTaskProjectId(task),
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
              { taskId, projectId: getTaskProjectId(task), userId },
            );
          });
        const ownerId = getTaskProject(task).ownerId;
        if (ownerId && ownerId !== userId) {
          this.notification
            .notify({
              userId: ownerId,
              type: 'task_declined',
              title: `Task declined: ${result.title}`,
              body: `A developer declined the task "${result.title}".`,
              metadata: { taskId, projectId: getTaskProjectId(task) },
            })
            .catch((err) => {
              this.logger.error(
                `Failed to send notification for task decline: ${
                  err instanceof Error ? err.message : String(err)
                }`,
                { userId: ownerId, taskId, projectId: getTaskProjectId(task) },
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
          projectId: getTaskProjectId(task),
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
            { taskId, projectId: getTaskProjectId(task), userId },
          );
        });
      this.realtime.emitToProject(getTaskProjectId(task), 'task.updated', {
        taskId,
        projectId: getTaskProjectId(task),
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
   * Manual Jira retry: Scrum Master or project owner can re-enqueue Jira sync
   * for an APPROVED task with no jiraIssueKey.
   */
  async retryJiraSync(taskId: string, user: CurrentUserType): Promise<{ enqueued: boolean }> {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    const projectId = getTaskProjectId(task);
    const isOwner = await this.projectRepo.isOwner(projectId, user.userId);
    const isSm = user.role === Role.SCRUM_MASTER;
    if (!isOwner && !isSm) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Master or project owner can retry Jira sync',
        403,
      );
    }

    if (task.jiraIssueKey) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Task already synced to Jira', 409);
    }
    if (task.status !== TaskStatus.APPROVED) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `Task must be APPROVED to sync to Jira (current: ${task.status})`,
        400,
      );
    }

    // Clear any stale error before retry so UI reflects the latest attempt.
    await this.taskRepo.setJiraSyncLastError(taskId, null);

    if (process.env.DISABLE_QUEUES === 'true') {
      // Local/dev fallback: run inline when BullMQ is disabled.
      this.logger.log(`[jira-sync] manual retry inline taskId=${taskId} (DISABLE_QUEUES=true)`);
      await this.jiraSyncService.syncTaskToJira(taskId);
      return { enqueued: true };
    }

    try {
      const jobId = await this.jiraSyncQueue.enqueue(taskId);
      this.logger.log(`[jira-sync] manual retry enqueued taskId=${taskId} jobId=${jobId}`);
      return { enqueued: true };
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Failed to enqueue Jira sync: ${err.message}`
          : `Failed to enqueue Jira sync: ${String(err)}`;
      await this.taskRepo.setJiraSyncLastError(taskId, msg);
      this.logger.error(`[jira-sync] manual retry enqueue failed taskId=${taskId}: ${msg}`);
      throw err;
    }
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
    const task = await this.taskRepo.findByIdWithProject(taskId);
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
      this.realtime.emitToProject(getTaskProjectId(task), 'task.updated', {
        taskId,
        projectId: getTaskProjectId(task),
        status: result.status,
        assigneeId: null,
        updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
      });
      this.activityLog
        .log({
          projectId: getTaskProjectId(task),
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
            { taskId, projectId: getTaskProjectId(task), userId: currentUser.userId },
          );
        });
      return result;
    }

    if (!TaskStateMachine.canTransition(task.status, TaskStatus.SENT_TO_DEVELOPER)) {
      throw new AppException(ErrorCode.INVALID_STATE, `Cannot assign from ${task.status}`, 400);
    }

    await assertProjectTaskAssignee(this.projectRepo, getTaskProjectId(task), assigneeId);

    const result = await this.taskRepo.updateAssigneeAndStatus(
      taskId,
      assigneeId,
      TaskStatus.SENT_TO_DEVELOPER,
    );
    this.realtime.emitToProject(getTaskProjectId(task), 'task.updated', {
      taskId,
      projectId: getTaskProjectId(task),
      status: result.status,
      assigneeId: result.assigneeId ?? assigneeId,
      updatedAt: (result as unknown as { updatedAt?: Date }).updatedAt ?? new Date(),
    });
    this.realtime.emitToUser(assigneeId, 'task.assigned', {
      taskId,
      projectId: getTaskProjectId(task),
      title: task.title,
      status: result.status,
    });
    this.activityLog
      .log({
        projectId: getTaskProjectId(task),
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
          { taskId, projectId: getTaskProjectId(task), userId: currentUser.userId },
        );
      });
    this.notification
      .notify({
        userId: assigneeId,
        type: 'task_assigned',
        title: `New task: ${task.title}`,
        body: `You have been assigned the task "${task.title}".`,
        metadata: { taskId, projectId: getTaskProjectId(task) },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to send notification for task assignment: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { userId: assigneeId, taskId, projectId: getTaskProjectId(task) },
        );
      });
    return result;
  }

  async deleteTask(taskId: string, user: CurrentUserType) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    const projectId = getTaskProjectId(task);
    const isOwner = await this.projectRepo.isOwner(projectId, user.userId);
    const isMember = await this.projectRepo.isMember(projectId, user.userId);
    const canDelete = user.role === Role.SCRUM_MASTER && (isOwner || isMember);

    if (!canDelete) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'Only Scrum Masters can delete tasks',
        403,
      );
    }

    if (task.jiraIssueKey?.trim()) {
      // If the task created a Jira ticket, delete the ticket first to avoid leaving an orphan.
      // If Jira deletion fails, we intentionally abort task deletion so the user can retry.
      await this.jiraIssueService.deleteIssue(projectId, task.jiraIssueKey, user.userId);
    }

    await this.taskRepo.delete(taskId);

    this.realtime.emitToProject(projectId, 'task.deleted', { taskId, projectId });

    this.activityLog
      .log({
        projectId,
        userId: user.userId,
        action: 'task.deleted',
        entityType: 'Task',
        entityId: taskId,
        metadata: { title: task.title },
      })
      .catch((err) => {
        this.logger.warn({ taskId, projectId, err }, 'Failed to log task.deleted activity');
      });

    return { id: taskId, deleted: true };
  }

  async getJiraIssueDetailsForTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    if (!task.jiraIssueKey?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Task is not synced to Jira yet', 400);
    }
    return this.jiraIssueService.getIssueDetails(getTaskProjectId(task), task.jiraIssueKey, userId);
  }

  async getJiraOverviewForTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    if (!task.jiraIssueKey?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Task is not synced to Jira yet', 400);
    }

    const projectId = getTaskProjectId(task);
    const issueKey = task.jiraIssueKey.trim().toUpperCase();

    const [issue, transitions, priorities, users, browse] = await Promise.all([
      this.jiraIssueService.getIssueDetails(projectId, issueKey, userId),
      this.jiraIssueService.getTransitions(projectId, issueKey, userId),
      this.jiraIssueService.getPriorities(projectId, userId),
      this.jiraIssueService.getAssignableUsers(projectId, issueKey, userId),
      this.jiraIssueService.getBrowseUrl(projectId, issueKey, userId),
    ]);

    return {
      issue,
      transitions: transitions.transitions ?? [],
      priorities: priorities.priorities ?? [],
      assignableUsers: users.users ?? [],
      browseUrl: browse.browseUrl,
    };
  }

  async importJiraIssuesToTasks(projectId: string, user: CurrentUserType) {
    const isOwner = await this.projectRepo.isOwner(projectId, user.userId);
    const isMember = await this.projectRepo.isMember(projectId, user.userId);
    const canImport = user.role === Role.SCRUM_MASTER && (isOwner || isMember);
    if (!canImport) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Only Scrum Masters can import Jira tasks', 403);
    }

    const context = await this.jiraContextService.getBoardContext(projectId);
    const issues = context.tasks ?? [];

    let upserted = 0;
    for (const issue of issues) {
      const issueKey = issue.task_id?.trim();
      if (!issueKey) continue;

      const assigneeAccountId = issue.assigneeAccountId?.trim() ?? null;
      const assignee = assigneeAccountId
        ? await this.prisma.jiraAccount.findFirst({
            where: { accountId: assigneeAccountId },
            select: { userId: true },
          })
        : null;

      await this.prisma.task.upsert({
        where: { projectId_jiraIssueKey: { projectId, jiraIssueKey: issueKey } },
        update: {
          title: issue.title?.trim() || issueKey,
          status: TaskStatus.SYNCED,
          source: TaskSource.JIRA_IMPORT,
          assigneeId: assignee?.userId ?? null,
        },
        create: {
          projectId,
          jiraIssueKey: issueKey,
          title: issue.title?.trim() || issueKey,
          description: null,
          status: TaskStatus.SYNCED,
          source: TaskSource.JIRA_IMPORT,
          createdById: user.userId,
          assigneeId: assignee?.userId ?? null,
        },
      });
      upserted += 1;
    }

    return { imported: issues.length, upserted };
  }

  async updateJiraIssueForTask(
    taskId: string,
    userId: string,
    patch: { summary?: string; priorityName?: string; assigneeAccountId?: string | null },
  ) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    if (!task.jiraIssueKey?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Task is not synced to Jira yet', 400);
    }
    const projectId = getTaskProjectId(task);
    const issueKey = task.jiraIssueKey.trim().toUpperCase();
    return this.jiraIssueService.updateIssueFields(projectId, issueKey, userId, patch);
  }

  async getById(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithProject(taskId);

    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }

    const projectId = getTaskProjectId(task);
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    const isAssignee = task.assigneeId === userId;

    if (!isOwner && !isMember && !isAssignee) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this task', 403);
    }

    return task;
  }

  async getProposedJiraTransitionsForTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    const issueKey = task.jiraProposalIssueKey?.trim();
    if (!issueKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Task has no proposed Jira issue to transition',
        400,
      );
    }
    const transitions = await this.jiraIssueService.getTransitions(
      getTaskProjectId(task),
      issueKey,
      userId,
    );
    return {
      issueKey: issueKey.toUpperCase(),
      jiraProposalAction: task.jiraProposalAction,
      jiraProposalTargetStatus: task.jiraProposalTargetStatus,
      jiraProposalTransitionId: task.jiraProposalTransitionId,
      ...transitions,
    };
  }

  async getJiraTransitionsForTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    if (!task.jiraIssueKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Task is not synced to Jira yet',
        400,
      );
    }
    return this.jiraIssueService.getTransitions(
      getTaskProjectId(task),
      task.jiraIssueKey,
      userId,
    );
  }

  async transitionJiraIssueForTask(
    taskId: string,
    userId: string,
    transitionId: string,
  ) {
    const task = await this.taskRepo.findByIdWithProject(taskId);
    if (!task) {
      throw new AppException(ErrorCode.TASK_NOT_FOUND, 'Task not found', 404);
    }
    await this.assertTaskProjectAccess(task, userId);
    if (!task.jiraIssueKey) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Task is not synced to Jira yet',
        400,
      );
    }
    return this.jiraIssueService.transitionIssue(
      getTaskProjectId(task),
      task.jiraIssueKey,
      transitionId,
      userId,
    );
  }

  private async assertTaskProjectAccess(
    task: TaskWithMeetingAndProject,
    userId: string,
  ): Promise<void> {
    const projectId = getTaskProjectId(task);
    const isOwner = await this.projectRepo.isOwner(projectId, userId);
    const isMember = await this.projectRepo.isMember(projectId, userId);
    const isAssignee = task.assigneeId === userId;
    if (!isOwner && !isMember && !isAssignee) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Access denied to this task', 403);
    }
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
