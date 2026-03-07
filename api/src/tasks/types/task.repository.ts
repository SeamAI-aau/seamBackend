import type { Task, TaskStatus, Meeting, Project } from '@prisma/client';

export interface TaskFilters {
  projectId?: string;
  meetingId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

export interface TaskWithMeetingAndProject extends Task {
  meeting: Meeting & { project: Project };
}

export interface TaskWithMeetingProject extends Task {
  meeting: {
    project: Project;
  };
}

/** Task with meeting (id, title) and assignee (id, email, name) for list views. */
export interface TaskWithMeetingAndAssignee extends Task {
  meeting: { id: string; title: string };
  assignee: { id: string; email: string; name: string | null } | null;
}

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;

  findByIdWithProject(taskId: string): Promise<TaskWithMeetingProject | null>;

  findByIdWithMeetingAndProject(
    id: string,
  ): Promise<TaskWithMeetingAndProject | null>;

  updateStatus(id: string, status: TaskStatus): Promise<Task>;

  markAsCreatedInJira(taskId: string, jiraIssueKey: string): Promise<Task>;

  updateAssigneeAndStatus(
    id: string,
    assigneeId: string,
    status: TaskStatus,
  ): Promise<Task>;

  findMany(filters: TaskFilters): Promise<Task[]>;

  findManyWithMeetingAndAssignee(
    filters: TaskFilters,
  ): Promise<TaskWithMeetingAndAssignee[]>;
}
