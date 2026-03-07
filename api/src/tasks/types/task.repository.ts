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

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;

  findByIdWithMeetingAndProject(
    id: string,
  ): Promise<TaskWithMeetingAndProject | null>;

  updateStatus(id: string, status: TaskStatus): Promise<Task>;

  updateAssigneeAndStatus(
    id: string,
    assigneeId: string,
    status: TaskStatus,
  ): Promise<Task>;

  findMany(filters: TaskFilters): Promise<Task[]>;
}
