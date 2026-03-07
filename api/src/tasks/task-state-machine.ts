import type { TaskStatus } from '@prisma/client';

/** Enforces allowed task status transitions (e.g. EXTRACTED → SENT_TO_DEVELOPER only). */
export class TaskStateMachine {
  private static readonly transitions: Record<TaskStatus, TaskStatus[]> = {
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
