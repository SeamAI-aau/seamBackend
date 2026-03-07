import { Injectable, Inject } from '@nestjs/common';
import type { ITaskRepository, TaskFilters } from './types/task.repository';
import { TASK_REPOSITORY } from './types/task.tokens';
import { TaskStateMachine } from './task-state-machine';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { TaskStatus, Role } from '@prisma/client';
import type { CurrentUserType } from '../auth/types/current-user.type';
import { PROJECT_REPOSITORY } from '../project/types/project.tokens';
import type { IProjectRepository } from '../project/types/project.repository';
import { JiraSyncQueue } from '../integrations/jira/queue/jira-sync.queue';

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepo: IProjectRepository,
    private readonly jiraSyncQueue: JiraSyncQueue,
  ) {}

  async approveTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findById(taskId);

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
    if (!approvedTask.jiraIssueKey) {
      await this.jiraSyncQueue.enqueue(task.id);
    }
    return approvedTask;
  }


  async declineTask(taskId: string, userId: string) {
    const task = await this.taskRepo.findById(taskId);

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

    return this.taskRepo.updateStatus(taskId, TaskStatus.REJECTED);
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

    const task = await this.taskRepo.findById(taskId);

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

    return this.taskRepo.updateAssigneeAndStatus(
      taskId,
      assigneeId,
      TaskStatus.SENT_TO_DEVELOPER,
    );
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
    filters: TaskFilters,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(filters, { skip, take: limit }),
      this.taskRepo.count(filters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getTasksByMeeting(
    filters: TaskFilters,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(filters, { skip, take: limit }),
      this.taskRepo.count(filters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getTasksForAssignee(
    userId: string,
    status?: TaskStatus,
    page: number = 1,
    limit: number = 20,
  ) {
    const filters = { assigneeId: userId, status };
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskRepo.findManyWithMeetingAndAssignee(filters, { skip, take: limit }),
      this.taskRepo.count(filters),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }
}
