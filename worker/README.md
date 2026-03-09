# Seam AI Worker

Python worker that consumes **meeting-transcription** jobs from Redis (BullMQ), runs the audio pipeline (STT + task extraction), and POSTs results to the NestJS API.

## Flow

1. NestJS enqueues a job with `{ meetingId, audioUrl }`.
2. This worker picks the job, calls `app.pipeline.run_meeting_pipeline(audio_url)`.
3. Pipeline returns a dict matching **WorkerResultPayload** (status, transcript, diarization, tasks, optional blockers, or error).
4. Worker POSTs that payload to `POST {API_URL}/internal/meetings/{meetingId}/result` with header `x-worker-secret: {WORKER_SECRET}`.
5. On pipeline exception, the worker sends `{ status: "failed", error: "..." }` so the API can set the meeting to FAILED, then re-raises for BullMQ retries.

## Config (env)

| Variable        | Description                          | Default        |
|----------------|--------------------------------------|----------------|
| `REDIS_HOST`   | Redis host for the queue             | `localhost`    |
| `REDIS_PORT`   | Redis port                           | `6379`         |
| `API_URL`      | NestJS API base URL                  | `http://localhost:3000` |
| `WORKER_SECRET`| Secret for callback auth (required)  | —              |
| `LOG_LEVEL`    | Logging level                        | `INFO`         |

## Pipeline placeholder

**`app/pipeline.py`** contains a placeholder implementation. ML engineers should replace `run_meeting_pipeline(audio_url)` with:

- Downloading or streaming the audio from `audio_url`
- Running STT (e.g. Whisper) for transcription
- Running diarization if required
- Running NLP/LLM for task and blocker extraction
- Returning a dict in this shape:

```python
{
    "status": "success",       # or "failed"
    "transcript": "...",      # full text
    "diarization": {...},     # optional JSON
    "tasks": [                # list of extracted tasks
        {"title": "...", "description": "...", "assigneeId": "user-uuid"}  # optional; if present, task is auto-assigned and sent to developer
    ],
    "blockers": [             # optional: blockers extracted from transcript (NLP)
        {"category": "risk", "message": "Deployment blocked by infra ticket"}
    ],
    "error": "..."            # when status is "failed"
}
```

- **blockers** (optional): List of `{ "category": str?, "message": str }`. Persisted as **TranscriptBlocker** and shown on the project dashboard next to GitHub PR blockers. Use `category` for display/filtering (e.g. `"risk"`, `"dependency"`, `"resource"`); `message` is required.

The API expects this payload on `POST /internal/meetings/:id/result`.

## Run locally

```bash
cd worker
pip install -r requirements.txt
export WORKER_SECRET=your-secret
export API_URL=http://localhost:3000
python main.py
```

## Run with Docker

```bash
docker build -t seam-worker ./worker
docker run --env-file .env seam-worker
```

Ensure Redis and the API are reachable (e.g. same network or correct `API_URL`).
