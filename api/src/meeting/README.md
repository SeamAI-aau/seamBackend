# Meeting Module

Handles meeting upload, transcription job enqueue, and worker result persistence for Seam AI stand-ups.

## Flow

1. **Upload** – `POST /projects/:projectId/meetings` (multipart `file`)  
   Owner uploads audio → Cloudinary → meeting created (status `UPLOADED`) → job added to `meeting-transcription` queue.

2. **Worker** – External (e.g. Python Celery) consumes the job, runs Whisper + NLP, then calls:
   - `POST /internal/meetings/:id/result`  
   Header: `x-worker-secret: <WORKER_SECRET>`  
   Body: `WorkerResultPayload` (see `dto/worker-result.dto.ts`). Optional `blockers` array is persisted as **TranscriptBlocker** and exposed on the project dashboard next to GitHub blockers.

3. **Persistence** – `MeetingProcessingService` saves transcript + tasks (+ optional transcript blockers), then sets status → `TASKS_EXTRACTED`, or sets meeting status to `FAILED` on error/invalid payload.

## Public API (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:projectId/meetings` | Upload meeting audio (owner only) |
| GET | `/projects/:projectId/meetings` | List meetings for project |
| GET | `/projects/:projectId/meetings/:meetingId` | Get meeting with transcripts and tasks |

## Internal API (worker only)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/internal/meetings/:id/result` | Submit transcription result (header `x-worker-secret` required) |

Set `WORKER_SECRET` in env so the worker can authenticate to the callback.
