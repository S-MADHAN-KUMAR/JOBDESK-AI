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
    credit_usage = models.JSONField(
        default=dict,
        blank=True,
        help_text='Latest provider credit balances (searches/USD/compute units).',
    )
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
        key = getattr(settings, 'FIELD_ENCRYPTION_KEY', None) or ''
        if not key:
            raise ValueError('FIELD_ENCRYPTION_KEY is not configured')
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
    batch_id = models.UUIDField(null=True, blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True, default='')
    classified_count = models.PositiveIntegerField(default=0)
    current_step = models.CharField(max_length=100, blank=True, default='')
    duplicate_count = models.PositiveIntegerField(default=0)
    filters = models.JSONField(default=dict, blank=True)
    requests_made = models.PositiveIntegerField(default=0)
    retry_of_id = models.UUIDField(null=True, blank=True)
    skipped_reason = models.CharField(max_length=500, blank=True, default='')
    step_logs = models.JSONField(default=list, blank=True)
    trigger = models.CharField(max_length=50, blank=True, default='manual')
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='triggered_runs',
    )
    unique_count = models.PositiveIntegerField(default=0)
    valid_count = models.PositiveIntegerField(default=0)

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
    posted_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processing_error = models.TextField(blank=True, default='')
    processing_status = models.CharField(max_length=50, blank=True, default='pending')

    class Meta:
        indexes = [
            models.Index(fields=['provider_code', 'external_id']),
            models.Index(fields=['fetched_at']),
        ]

    def __str__(self):
        return f"{self.provider_code}:{self.external_id}"


class IngestionSchedule(models.Model):
    """Admin-managed recurring/one-time ingestion schedules (server-side)."""

    class Frequency(models.TextChoices):
        ONCE = 'once', 'One-time'
        DAILY = 'daily', 'Daily'
        WEEKLY = 'weekly', 'Weekly'
        MONTHLY = 'monthly', 'Monthly'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # 'all' or a JobSource UUID string
    source_id = models.CharField(max_length=64, default='all')
    keyword = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    country = models.CharField(max_length=100, blank=True, default='India')
    max_pages = models.PositiveIntegerField(default=5)
    min_salary = models.PositiveIntegerField(default=0)
    max_salary = models.PositiveIntegerField(default=0)
    employment_type = models.CharField(max_length=50, blank=True, default='')
    work_mode = models.CharField(max_length=50, blank=True, default='')
    role = models.CharField(max_length=255, blank=True, default='')
    posted_within = models.CharField(max_length=50, blank=True, default='')
    platforms = models.JSONField(default=list, blank=True)
    apify_platforms = models.JSONField(default=list, blank=True)
    serpapi_platforms = models.JSONField(default=list, blank=True)
    frequency = models.CharField(
        max_length=20,
        choices=Frequency.choices,
        default=Frequency.DAILY,
    )
    time = models.CharField(max_length=20, default='9:00 AM')
    day_of_week = models.PositiveSmallIntegerField(
        default=1,
        help_text='JS-style weekday: 0=Sunday .. 6=Saturday',
    )
    day_of_month = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField(null=True, blank=True)
    total_runs = models.PositiveIntegerField(
        default=0,
        help_text='0 means unlimited',
    )
    runs_completed = models.PositiveIntegerField(default=0)
    enabled = models.BooleanField(default=True)
    last_run = models.DateTimeField(null=True, blank=True)
    last_run_status = models.CharField(max_length=20, blank=True, default='')
    last_error = models.TextField(blank=True, default='')
    next_run = models.DateTimeField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ingestion_schedules',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['enabled', 'next_run']),
        ]

    def __str__(self):
        return f"{self.frequency} @ {self.time} ({self.keyword or 'any'})"


class MarketAlert(models.Model):
    """Persisted market/ops alert with dismiss history."""

    class Severity(models.TextChoices):
        HIGH = 'high', 'High'
        MEDIUM = 'medium', 'Medium'
        LOW = 'low', 'Low'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fingerprint = models.CharField(max_length=120, unique=True, db_index=True)
    severity = models.CharField(max_length=16, choices=Severity.choices)
    category = models.CharField(max_length=64)
    title = models.CharField(max_length=255)
    message = models.TextField()
    role_category = models.CharField(max_length=255, blank=True, default='')
    company_id = models.CharField(max_length=64, blank=True, default='')
    company_name = models.CharField(max_length=255, blank=True, default='')
    provider = models.CharField(max_length=64, blank=True, default='')
    metric = models.FloatField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    dismissed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dismissed_alerts',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


# Import ingestion pipeline models so Django detects them for migrations
from core.ingestion_models import (  # noqa: E402, F401
    CanonicalJob,
    EmployerHiringScore,
    JobClassification,
    JobDemandMovement,
    JobSnapshot,
    JobSourceRecord,
    MasterCompany,
    MasterJobRole,
    MasterLocation,
    MasterSkill,
    MasterTechnology,
)