# Meeting Module

Meeting upload → **ai-engine-2** over HTTP; results return via **`POST /internal/meetings/:id/result`**.

## Flow

1. **Upload** – `POST /projects/:projectId/meetings` (multipart `file`)  
   Owner uploads audio → Cloudinary → meeting row (`UPLOADED`).  
   **`AI_ENGINE_BASE_URL` is required**; Nest downloads the file from `audioUrl` and `POST`s to  
   `{AI_ENGINE_BASE_URL}/api/v1/meetings/process-audio` with form fields **`meeting_id`**, **`project_id`**, and **`file`**.  
   The engine returns **HTTP 202** immediately with a **`job_id`**, runs the pipeline **in the background**, then `POST`s transcript/tasks to Nest (`WORKER_SECRET` must match). Nest sets **`PROCESSING`** + `externalJobId` after 202; completion is via callback.  
   Dispatch failure (non-202, missing `job_id`, network): **`FAILED`** + `lastProcessingError`. `AI_ENGINE_REQUEST_TIMEOUT_MS` bounds **download + upload until 202**, not full AI runtime.

2. **Callback** – ai-engine-2 `POST`s to Nest:

   - `POST /internal/meetings/:id/result`  
     Header: `x-worker-secret: <WORKER_SECRET>` (same value in ai-engine `WORKER_SECRET` and Nest `WORKER_SECRET`)  
   Body: `WorkerResultPayload` (see `dto/worker-result.dto.ts`). Payload includes `new_tasks`, `transitioned_tasks`, `blockers`, and `summary`. Blockers are persisted to **TranscriptBlocker**.

3. **Persistence** – `MeetingProcessingService` saves transcript + tasks (+ optional transcript blockers), sets status → `TASKS_EXTRACTED`, or `FAILED` on error/invalid payload. Tasks **with** NLP `assigneeId` → `task_assigned` to the developer; tasks **without** assignee → **`tasks_pending_assignment`** to project **owner** and **Scrum Master** members (so they can assign before approve/decline). Optional per-task Jira proposal fields (`task_id`, `suggested_status`, `jiraAction`) are stored for post-approve create/transition (no Jira writes on callback).

**Jira context for ai-engine:** `GET /internal/jira/context?project_id=<uuid>` → `{ tasks, statuses }`. Set engine `JIRA_CONTEXT_URL` to that URL (auth: `x-worker-secret` or internal key pair).

## Ops

- **`DISABLE_QUEUES`**: only affects **Jira/GitHub** Bull workers (via shared Redis connection). It does **not** replace `AI_ENGINE_BASE_URL`; without the AI URL, meeting upload returns **400**.
- **ai-engine callback:** Without `NESTJS_BASE_URL` + `WORKER_SECRET` on the engine, processing still runs there but **Nest never receives results** — meetings can stay **`PROCESSING`**. Configure the webhook on ai-engine-2 for production.

## Public API (JWT)

| Method | Path                                       | Description                            |
| ------ | ------------------------------------------ | -------------------------------------- |
| POST   | `/projects/:projectId/meetings`            | Upload meeting audio (owner only)      |
| GET    | `/projects/:projectId/meetings`            | List meetings for project              |
| GET    | `/projects/:projectId/meetings/:meetingId` | Get meeting with transcripts and tasks |

## Internal API

| Method | Path                            | Description                                                     |
| ------ | ------------------------------- | --------------------------------------------------------------- |
| POST   | `/internal/meetings/:id/result` | Transcription result (`x-worker-secret` + `WorkerResultPayload`) |

Set **`WORKER_SECRET`** for the callback.

Open **`/api-docs`** on this API for interactive OpenAPI (meetings, internal callback, tasks, etc.).

The old **`seamBackend/worker`** Bull consumer has been removed from the repo; use **ai-engine-2** for processing.
