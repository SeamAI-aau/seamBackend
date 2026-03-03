export type TaskTransition = {
  from: string;
  to: string;
};

import { TaskStatus } from '@prisma/client';

export class TaskStateMachine {
  private static transitions: Record<TaskStatus, TaskStatus[]> = {
    EXTRACTED: ['SENT_TO_DEVELOPER'],
    SENT_TO_DEVELOPER: ['APPROVED', 'REJECTED'],
    APPROVED: ['SYNCED'],
    REJECTED: [],
    SYNCED: [],
  };

  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    return this.transitions[from]?.includes(to) ?? false;
  }
}
