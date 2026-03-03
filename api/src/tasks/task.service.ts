import { Injectable, Inject } from '@nestjs/common';
import type { ITaskRepository } from './task.repository';
import { TASK_REPOSITORY } from './task-tokens';
import { TaskStateMachine } from './task-state-machine';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
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

    return this.taskRepo.updateStatus(taskId, TaskStatus.APPROVED);
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
}
