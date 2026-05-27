import type { Task, TaskStatus, Meeting, Project } from '@prisma/client';

export interface TaskFilters {
  projectId?: string;
  meetingId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

/** Task with project (required) and optional meeting for list/detail views. */
export interface TaskWithProject extends Task {
  project: Project;
  meeting?: Pick<Meeting, 'id' | 'title'> | null;
}

export interface TaskWithMeetingAndProject extends Task {
  project: Project;
  meeting?: (Meeting & { project?: Project }) | null;
}

/** Task with meeting (id, title) and assignee (id, email, name) for list views. */
export interface TaskWithMeetingAndAssignee extends Task {
  meeting?: { id: string; title: string } | null;
  assignee: { id: string; email: string; name: string | null } | null;
}

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;

  findByIdWithProject(taskId: string): Promise<TaskWithMeetingAndProject | null>;

  /** @deprecated Use findByIdWithProject */
  findByIdWithMeetingAndProject(id: string): Promise<TaskWithMeetingAndProject | null>;

  updateStatus(id: string, status: TaskStatus): Promise<Task>;

  markAsCreatedInJira(taskId: string, jiraIssueKey: string): Promise<Task>;

  setJiraSyncLastError(taskId: string, message: string | null): Promise<Task>;

  updateAssigneeAndStatus(id: string, assigneeId: string, status: TaskStatus): Promise<Task>;

  clearAssigneeAndStatus(id: string, status: TaskStatus): Promise<Task>;

  findMany(filters: TaskFilters): Promise<Task[]>;

  findManyWithMeetingAndAssignee(
    filters: TaskFilters,
    options?: { skip?: number; take?: number },
  ): Promise<TaskWithMeetingAndAssignee[]>;

  count(filters: TaskFilters): Promise<number>;

  delete(id: string): Promise<void>;
}
