"""Central settings — replaces config/settings.py. Reads .env from backend/ or project root."""
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent

class Settings(BaseSettings):
    # App
    secret_key: str = "change-me-to-a-random-secret-key"
    field_encryption_key: str = ""
    debug: bool = True
    allowed_hosts: List[str] = ["localhost", "127.0.0.1", "testserver", "backend"]
    cors_allowed_origins: List[str] = ["http://localhost:3000"]
    csrf_trusted_origins: List[str] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"
    time_zone: str = "Asia/Kolkata"

    # Database / Cache
    database_url: str = "postgresql://postgres:postgres@localhost:5432/demandaccel"
    redis_url: str = "redis://localhost:6379/0"

    # Celery
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    ingestion_eager: bool = True
    ingestion_schedule_time: str = "1:00 AM"
    ingestion_expire_days: int = 14
    classification_confidence_threshold: float = 0.6
    llm_classification_provider: str = "none"
    llm_classification_model: str = "gpt-4o-mini"

    # LLM / Email
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    resend_api_key: str = ""
    email_host: str = ""
    email_port: int = 587
    email_host_user: str = ""
    email_host_password: str = ""
    email_use_tls: bool = True
    default_from_email: str = "DemandAccel <noreply@localhost>"

    # JWT
    jwt_access_cookie: str = "da_access"
    jwt_refresh_cookie: str = "da_refresh"
    access_token_lifetime_minutes: int = 60
    refresh_token_lifetime_days: int = 1

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(ROOT_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("allowed_hosts", "cors_allowed_origins", "csrf_trusted_origins", mode="before")
    @classmethod
    def split_comma(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def effective_secret(self) -> str:
        # SECRET_KEY and DJANGO_SECRET_KEY are aliases — pydantic maps secret_key from SECRET_KEY env
        return self.secret_key

    @property
    def effective_encryption_key(self) -> str:
        return self.field_encryption_key or self.secret_key

    @property
    def broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url

settings = Settings()

# Backward compat: DJANGO_SECRET_KEY env still works via alias fallback
import os
if not settings.secret_key or settings.secret_key in ("", "change-me-to-a-random-secret-key"):
    alt = os.getenv("DJANGO_SECRET_KEY") or os.getenv("SECRET_KEY")
    if alt:
        settings.secret_key = alt
