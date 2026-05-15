/** BullMQ queue name for GitHub PR sync (see `integrations/github/queue`). */
export const GITHUB_SYNC_QUEUE_NAME = 'github-sync';

/** Default interval for `sync-all` repeatable job (10 minutes). Override with `GITHUB_SYNC_REPEAT_MS`. */
export const DEFAULT_GITHUB_SYNC_REPEAT_MS = 10 * 60 * 1000;
