import os
import logging
import requests
from bullmq import Worker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
API_URL = os.getenv("API_URL", "http://localhost:3000")
WORKER_SECRET = os.getenv("WORKER_SECRET")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger("ai-worker")


# 🔹 Fake AI Processing (Stub)
def fake_ai_processing(audio_url: str):
    logger.info(f"Processing audio: {audio_url}")

    return {
        "transcript": "This is a fake transcript for MVP.",
        "diarization": {
            "speakers": [
                {"speaker": "Speaker 1", "start": 0, "end": 10}
            ]
        },
        "tasks": [
            {
                "title": "Refactor API layer",
                "description": "Improve code structure",
                "confidenceScore": 0.92,
                "assigneeId": None,
            }
        ],
    }


# 🔹 Job Processor
def process(job):
    meeting_id = job.data["meetingId"]
    audio_url = job.data["audioUrl"]

    logger.info(f"Received job for meeting: {meeting_id}")

    try:
        result = fake_ai_processing(audio_url)

        response = requests.post(
            f"{API_URL}/internal/meetings/{meeting_id}/result",
            json=result,
            headers={"x-worker-secret": WORKER_SECRET},
            timeout=10,
        )

        response.raise_for_status()

        logger.info(f"Successfully processed meeting {meeting_id}")

    except Exception as e:
        logger.error(f"Error processing meeting {meeting_id}: {str(e)}")
        raise e  # Important: lets BullMQ retry


if __name__ == "__main__":
    logger.info("Starting AI Worker...")

    Worker(
        "meeting-transcription",
        process,
        connection={"host": REDIS_HOST, "port": REDIS_PORT},
    )
