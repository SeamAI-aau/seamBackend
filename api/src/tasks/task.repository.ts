import type { Task, TaskStatus, Project } from '@prisma/client';

export interface TaskWithMeetingProject extends Task {
  meeting: {
    project: Project;
  };
}

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;

  findByIdWithProject(taskId: string): Promise<TaskWithMeetingProject | null>;

  updateStatus(id: string, status: TaskStatus): Promise<Task>;

  markAsCreatedInJira(taskId: string, jiraIssueKey: string): Promise<Task>;
}
