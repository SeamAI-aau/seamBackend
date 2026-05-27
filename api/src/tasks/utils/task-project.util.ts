import type { Project, Task } from '@prisma/client';

export type TaskWithProjectRelation = Task & {
  project: Project;
  meeting?: { project?: Project; projectId?: string } | null;
};

/** Resolve project id from a task loaded with `include: { project: true }`. */
export function getTaskProjectId(task: TaskWithProjectRelation): string {
  return task.projectId;
}

/** Project row for permissions, Jira, and realtime (requires `project` include). */
export function getTaskProject(task: TaskWithProjectRelation): Project {
  return task.project;
}
