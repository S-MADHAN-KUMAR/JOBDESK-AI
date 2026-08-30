"""Contact enrichment models: provider sources, target companies, contacts, and run audit (SRS Section 7)."""

import base64
import hashlib
import json
import uuid

from django.conf import settings
from django.db import models
from cryptography.fernet import Fernet, InvalidToken


class EnrichmentSource(models.Model):
    """SRS Section 7: Configurable contact-enrichment connector (ContactOut, Apollo)."""

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
    daily_uses_on = models.DateField(
        null=True,
        blank=True,
        help_text='Local calendar date that current_daily_uses applies to.',
    )
    credit_usage = models.JSONField(
        default=dict,
        blank=True,
        help_text='Latest provider credit balances (email/phone/search/lead/dial).',
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


class Company(models.Model):
    """Target employer for contact enrichment campaigns."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    domain = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Contact(models.Model):
    """FR-022: Enriched recruiter / TA contact with full provenance audit."""

    VERIFICATION_CHOICES = [
        ('verified', 'Verified'),
        ('unverified', 'Unverified'),
        ('failed', 'Verification Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='contacts',
    )
    full_name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=255, blank=True, default='')
    email = models.EmailField(max_length=255, null=True, blank=True)
    phone = models.CharField(max_length=50, null=True, blank=True)
    linkedin_url = models.URLField(max_length=500, null=True, blank=True)
    provider_source = models.CharField(
        max_length=50,
        help_text="Source provider (contactout, apollo)",
    )
    verification_state = models.CharField(
        max_length=20,
        choices=VERIFICATION_CHOICES,
        default='unverified',
    )
    confidence_score = models.FloatField(default=0.0)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'contacts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['company', 'email']),
            models.Index(fields=['provider_source']),
            models.Index(fields=['verification_state']),
        ]

    def __str__(self):
        return f"{self.full_name} @ {self.company.name} ({self.provider_source})"


class EnrichmentRun(models.Model):
    """Audit trail for every waterfall enrichment execution (FR-022)."""

    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        PARTIAL = 'partial', 'Partial Failure'
        FAILED = 'failed', 'Failed'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='enrichment_runs',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.RUNNING,
    )
    providers_used = models.JSONField(default=list, blank=True)
    call_logs = models.JSONField(default=list, blank=True)
    contacts_found = models.PositiveIntegerField(default=0)
    stored_count = models.PositiveIntegerField(default=0)
    error_count = models.PositiveIntegerField(default=0)
    error_logs = models.JSONField(default=list, blank=True)
    pending_phone_requests = models.JSONField(default=list, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Enrichment {self.company.name} - {self.status} ({self.id})"