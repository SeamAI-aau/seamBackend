"""Worker configuration from environment."""
import os
from functools import lru_cache


@lru_cache
def get_settings() -> "Settings":
    return Settings()


class Settings:
    """Application settings. Load from env; validate required values at runtime."""

    def __init__(self) -> None:
        self.redis_host: str = os.getenv("REDIS_HOST", "localhost")
        self.redis_port: int = int(os.getenv("REDIS_PORT", "6379"))
        self.api_url: str = os.getenv("API_URL", "http://localhost:3000").rstrip("/")
        self.worker_secret: str | None = os.getenv("WORKER_SECRET") or None
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO")

    def require_worker_secret(self) -> str:
        if not self.worker_secret:
            raise RuntimeError("WORKER_SECRET is required to send results to the API")
        return self.worker_secret
