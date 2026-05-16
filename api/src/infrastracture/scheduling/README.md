# Background scheduling (Phase 8)

All **periodic** work uses **BullMQ repeatable jobs** on the shared Redis connection (`QueueModule`). We do **not** use `@nestjs/schedule` / in-process cron on each API pod.

## Registered repeatables

| Job | Queue | Interval | Registered by |
|-----|--------|----------|-----------------|
| `sync-all` | `github-sync` | `GITHUB_SYNC_REPEAT_MS` (default 10 min) | `SchedulingBootstrapService` |

`sync-all` enqueues `sync-project` for every project with a linked `githubRepoUrl`.

## Other triggers (not repeatables)

- **GitHub webhook** → `enqueueSyncProject` for matching repo(s)
- **Manual** `POST /integrations/github/sync/:projectId`
- **Developer activity** → on-demand `POST /developer-activity/sync/...` only

## Multi-instance deploy

- Set **`DISABLE_QUEUES=false`** and run at least one process that loads Bull **processors** (`GithubSyncProcessor`, `JiraSyncProcessor`).
- Repeatable job definitions live in **Redis**; multiple API instances calling `registerRepeatableSyncAll` on boot can create duplicate repeatable metadata — prefer **one** bootstrap path (`SchedulingBootstrapService` only).
- Do not add a second timer (e.g. `@Cron`) for the same GitHub sync without removing the Bull repeatable.

## Env

- `GITHUB_SYNC_REPEAT_MS` — optional override for GitHub `sync-all` interval (milliseconds).
- `DISABLE_QUEUES=true` — skips repeatable registration and no-op queues.
