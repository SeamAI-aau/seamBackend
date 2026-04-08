"""HTTP callback to NestJS API: submit transcription result or report failure."""
import logging
import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


def post_result(meeting_id: str, payload: dict) -> None:
    """
    POST transcription result to API internal endpoint.
    Payload must match WorkerResultPayload: status, transcript?, diarization?, tasks?, error?
    """
    settings = get_settings()
    secret = settings.require_worker_secret()
    url = f"{settings.api_url}/internal/meetings/{meeting_id}/result"

    try:
        response = requests.post(
            url,
            json=payload,
            headers={"x-worker-secret": secret},
            timeout=30,
        )
        response.raise_for_status()
        logger.info("Callback success for meeting_id=%s", meeting_id)
    except requests.RequestException as e:
        logger.exception("Callback failed for meeting_id=%s: %s", meeting_id, e)
        raise
