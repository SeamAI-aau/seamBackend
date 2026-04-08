"""
Seam AI Worker entrypoint.

Consumes jobs from the meeting-transcription queue (Redis/BullMQ), runs the
STT + extraction pipeline, and POSTs results to the NestJS API.
"""
import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from app.config import get_settings
from app.worker import create_worker

logging.basicConfig(
    level=get_settings().log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("worker")


def main() -> None:
    logger.info("Starting meeting-transcription worker")
    worker = create_worker()
    logger.info("Worker running; consuming queue=%s", worker.name)
    try:
        import time
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        if hasattr(worker, "close"):
            worker.close()


if __name__ == "__main__":
    main()
