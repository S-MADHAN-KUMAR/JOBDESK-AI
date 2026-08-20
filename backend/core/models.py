import base64
import hashlib
import json
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from cryptography.fernet import Fernet, InvalidToken


class User(AbstractUser):
    class Role(models.TextChoices):
        CEO_MANAGEMENT = 'CEO_MANAGEMENT', 'CEO / Management'
        MARKET_ANALYST = 'MARKET_ANALYST', 'Market Analyst'
        TRAINING_MANAGER = 'TRAINING_MANAGER', 'Training Manager'
        RECRUITMENT_TEAM = 'RECRUITMENT_TEAM', 'Recruitment / Employer Team'
        ADMIN = 'ADMIN', 'Admin'

    role = models.CharField(
        max_length=50,
        choices=Role.choices,
        default=Role.MARKET_ANALYST,
    )

    def __str__(self):
        return f"{self.username} - {self.role}"


class JobSource(models.Model):
    """FR-002: Modular job-source connector configuration."""

    class HealthStatus(models.TextChoices):
        HEALTHY = 'healthy', 'Healthy'
        DEGRADED = 'degraded', 'Degraded'
        FAILED = 'failed', 'Failed'
        RATE_LIMITED = 'rate_limited', 'Rate Limited'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50)
    provider_code = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)
    base_url = models.URLField(max_length=255, blank=True, default='')
    auth_config = models.JSONField(default=dict, blank=True)
    default_params = models.JSONField(default=dict, blank=True)
    rate_limit_rpm = models.PositiveIntegerField(default=60)
    rate_limit_daily = models.PositiveIntegerField(default=1000)
    current_daily_uses = models.PositiveIntegerField(default=0)
    health_status = models.CharField(
        max_length=20,
        choices=HealthStatus.choices,
        default=HealthStatus.HEALTHY,
    )
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pending_auth_config = None

    @staticmethod
    def _fernet():
        key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None) or settings.SECRET_KEY
        derived = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
        return Fernet(derived)

    def set_auth_config(self, data):
        """Queue plaintext credentials; encrypted automatically on save."""
        self._pending_auth_config = data

    def get_auth_config(self):
        """Decrypt and return stored credentials (server-side only)."""
        enc = self.auth_config.get('enc') if isinstance(self.auth_config, dict) else None
        if not enc:
            return {}
        try:
            return json.loads(self._fernet().decrypt(enc.encode()))
        except (InvalidToken, ValueError, TypeError):
            return {}

    def has_auth_config(self):
        return bool(self.get_auth_config())

    def save(self, *args, **kwargs):
        if self._pending_auth_config is not None:
            data = self._pending_auth_config or {}
            if all(not str(value).strip() for value in data.values()):
                data = {}
            payload = json.dumps(data).encode()
            self.auth_config = {'enc': self._fernet().encrypt(payload).decode()}
            self._pending_auth_config = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.provider_code})"


class IngestionRun(models.Model):
    """FR-003: Tracks every automated or manual scheduled execution job lifecycle."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        PARTIAL = 'partial', 'Partial Failure'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(
        JobSource,
        on_delete=models.CASCADE,
        related_name='ingestion_runs',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    fetched_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    error_logs = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.provider.provider_code} - {self.status} ({self.id})"


class RawJob(models.Model):
    """FR-004: Stores original provider payloads prior to normalization and deduplication."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ingestion_run = models.ForeignKey(
        IngestionRun,
        on_delete=models.CASCADE,
        related_name='raw_jobs',
    )
    provider_code = models.CharField(max_length=50)
    external_id = models.CharField(max_length=255)
    url = models.TextField(blank=True, default='')
    title = models.CharField(max_length=255)
    company = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    raw_payload = models.JSONField(default=dict, blank=True)
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['provider_code', 'external_id']),
            models.Index(fields=['fetched_at']),
        ]

    def __str__(self):
        return f"{self.provider_code}:{self.external_id}"