import { Task, TaskStatus } from '@prisma/client';

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;

  updateStatus(id: string, status: TaskStatus): Promise<Task>;
}
