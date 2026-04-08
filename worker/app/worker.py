"""BullMQ job processor: consume meeting-transcription jobs and run pipeline + callback."""
import logging
from typing import Any

from bullmq import Worker

from app.config import get_settings
from app.pipeline import run_meeting_pipeline
from app.callback import post_result

logger = logging.getLogger(__name__)

# Must match MEETING_TRANSCRIPTION_QUEUE_NAME in the NestJS codebase
QUEUE_NAME = "meeting-transcription"


def process_job(job: Any) -> None:
    """
    Process a single meeting-transcription job.
    Job data: { meetingId: str, audioUrl: str }
    """
    data = job.data or {}
    meeting_id = data.get("meetingId")
    audio_url = data.get("audioUrl")

    if not meeting_id or not audio_url:
        logger.error("Invalid job data: missing meetingId or audioUrl")
        post_result(
            meeting_id or "unknown",
            {"status": "failed", "error": "Invalid job: missing meetingId or audioUrl"},
        )
        return

    logger.info("Processing meeting_id=%s", meeting_id)

    try:
        result = run_meeting_pipeline(audio_url)
        if not isinstance(result, dict):
            post_result(
                meeting_id,
                {"status": "failed", "error": "Pipeline did not return a dict"},
            )
            return
        if result.get("status") != "success":
            post_result(meeting_id, result)
            return
        post_result(meeting_id, result)
    except Exception as e:
        logger.exception("Pipeline failed for meeting_id=%s", meeting_id)
        try:
            post_result(
                meeting_id,
                {"status": "failed", "error": str(e)},
            )
        except Exception as callback_err:
            logger.exception("Callback after failure also failed: %s", callback_err)
        raise  # Re-raise so BullMQ can retry if configured


def create_worker() -> Worker:
    settings = get_settings()
    return Worker(
        QUEUE_NAME,
        process_job,
        connection={"host": settings.redis_host, "port": settings.redis_port},
    )
