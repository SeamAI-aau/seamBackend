export type GithubSyncProjectJobData = { projectId: string };
export type GithubSyncAllJobData = Record<string, never>;

export type GithubSyncProjectJobResult = { synced: number };

export function syncProjectJobId(projectId: string): string {
  return `sync-project-${projectId}`;
}
