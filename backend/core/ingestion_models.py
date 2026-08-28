import hashlib
import uuid

from django.conf import settings
from django.db import models


# ---------------------------------------------------------------------------
# Master data tables
# ---------------------------------------------------------------------------

class MasterCompany(models.Model):
    """Normalized company entity deduplicated across all providers."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    normalized_name = models.CharField(max_length=255, unique=True, db_index=True)
    domain = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    logo_url = models.URLField(max_length=500, blank=True, default='')
    website = models.URLField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['normalized_name']

    def __str__(self):
        return self.name


class MasterLocation(models.Model):
    """Normalized location entity deduplicated across providers."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    raw_text = models.CharField(max_length=500, unique=True)
    city = models.CharField(max_length=255, blank=True, default='')
    state = models.CharField(max_length=255, blank=True, default='')
    country = models.CharField(max_length=255, blank=True, default='')
    normalized = models.CharField(max_length=500, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['normalized']

    def __str__(self):
        return self.normalized


class MasterJobRole(models.Model):
    """Taxonomy of job role categories (e.g. Backend Developer, Data Scientist)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    category = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class MasterTechnology(models.Model):
    """Taxonomy of technologies (e.g. Java, React, PostgreSQL)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    category = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class MasterSkill(models.Model):
    """Taxonomy of skills (e.g. Spring Boot, AWS, Docker)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    technology = models.ForeignKey(
        MasterTechnology,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='skills',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Canonical job and source record linkage
# ---------------------------------------------------------------------------

class CanonicalJob(models.Model):
    """Deduplicated, normalized job posting. One per unique real-world listing."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        EXPIRED = 'expired', 'Expired'
        ARCHIVED = 'archived', 'Archived'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    canonical_url = models.URLField(max_length=1000, blank=True, default='')
    title = models.CharField(max_length=500)
    normalized_title = models.CharField(max_length=500, blank=True, default='', db_column='title_normalized')
    company = models.ForeignKey(
        MasterCompany,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='canonical_jobs',
    )
    company_name_raw = models.CharField(max_length=255, blank=True, default='')
    location = models.ForeignKey(
        MasterLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='canonical_jobs',
    )
    location_raw = models.CharField(max_length=500, blank=True, default='')
    description = models.TextField(blank=True, default='')
    work_mode = models.CharField(
        max_length=50,
        choices=[
            ('remote', 'Remote'),
            ('hybrid', 'Hybrid'),
            ('onsite', 'On-site'),
            ('unknown', 'Unknown'),
        ],
        default='unknown',
    )
    employment_type = models.CharField(
        max_length=50,
        choices=[
            ('full_time', 'Full Time'),
            ('part_time', 'Part Time'),
            ('contract', 'Contract'),
            ('freelance', 'Freelance'),
            ('internship', 'Internship'),
            ('unknown', 'Unknown'),
        ],
        default='unknown',
    )
    seniority = models.CharField(
        max_length=50,
        choices=[
            ('intern', 'Intern'),
            ('junior', 'Junior'),
            ('mid', 'Mid-Level'),
            ('senior', 'Senior'),
            ('lead', 'Lead'),
            ('manager', 'Manager'),
            ('director', 'Director'),
            ('unknown', 'Unknown'),
        ],
        default='unknown',
    )
    experience_text = models.CharField(max_length=255, blank=True, default='')
    salary_text = models.CharField(max_length=255, blank=True, default='')
    posted_date = models.DateField(null=True, blank=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    classification_confidence = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_seen']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['normalized_title']),
            models.Index(fields=['company']),
            models.Index(fields=['location']),
            models.Index(fields=['-last_seen']),
            models.Index(fields=['work_mode']),
            models.Index(fields=['seniority']),
        ]

    def __str__(self):
        return f"{self.title} @ {self.company_name_raw or 'Unknown'}"


class JobSourceRecord(models.Model):
    """Links a raw ingestion record to its canonical job deduplication target."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    canonical_job = models.ForeignKey(
        CanonicalJob,
        on_delete=models.CASCADE,
        related_name='source_records',
    )
    raw_job = models.OneToOneField(
        'core.RawJob',
        on_delete=models.CASCADE,
        related_name='source_record',
    )
    provider_code = models.CharField(max_length=50)
    external_id = models.CharField(max_length=255)
    url = models.TextField(blank=True, default='', db_column='source_url')
    dedup_match_type = models.CharField(
        max_length=50,
        choices=[
            ('url_exact', 'URL Exact'),
            ('strong_signal', 'Company+Title+Location+Date'),
            ('description_sim', 'Description Similarity'),
            ('none', 'No Match (New)'),
        ],
        default='none',
        db_column='match_type',
    )
    match_confidence = models.FloatField(default=0.0)
    posted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['provider_code', 'external_id']),
            models.Index(fields=['canonical_job']),
        ]

    def __str__(self):
        return f"{self.provider_code}:{self.external_id} -> {self.canonical_job_id}"


# ---------------------------------------------------------------------------
# Classification & skill matrix
# ---------------------------------------------------------------------------

class JobClassification(models.Model):
    """AI/ deterministic classification output for a canonical job."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    canonical_job = models.OneToOneField(
        CanonicalJob,
        on_delete=models.CASCADE,
        related_name='classification',
    )
    role_category = models.CharField(max_length=255, blank=True, default='')
    primary_technologies = models.JSONField(default=list, blank=True)
    secondary_technologies = models.JSONField(default=list, blank=True)
    skills = models.JSONField(default=list, blank=True)
    confidence_score = models.FloatField(default=0.0)
    classification_method = models.CharField(
        max_length=20,
        choices=[
            ('rules', 'Deterministic Rules'),
            ('llm', 'LLM Classification'),
            ('hybrid', 'Hybrid'),
        ],
        default='rules',
    )
    raw_llm_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Classification: {self.canonical_job_id} ({self.confidence_score:.2f})"


# ---------------------------------------------------------------------------
# Snapshots & demand movement
# ---------------------------------------------------------------------------

class JobSnapshot(models.Model):
    """Daily snapshot of a canonical job's status for historical analytics."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    canonical_job = models.ForeignKey(
        CanonicalJob,
        on_delete=models.CASCADE,
        related_name='snapshots',
    )
    snapshot_date = models.DateField(db_index=True)
    is_active = models.BooleanField(default=True)
    source_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['canonical_job', 'snapshot_date']
        indexes = [
            models.Index(fields=['snapshot_date']),
        ]

    def __str__(self):
        return f"Snapshot {self.snapshot_date} for {self.canonical_job_id}"


class JobDemandMovement(models.Model):
    """7/30/60/90-day demand movement metrics per role category."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role_category = models.CharField(max_length=255, db_index=True)
    period_days = models.PositiveIntegerField()
    period_start = models.DateField()
    period_end = models.DateField()
    active_jobs_start = models.PositiveIntegerField(default=0)
    active_jobs_end = models.PositiveIntegerField(default=0)
    new_postings = models.PositiveIntegerField(default=0)
    expired_postings = models.PositiveIntegerField(default=0)
    net_change = models.IntegerField(default=0)
    change_percentage = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['role_category', 'period_days', 'period_start']
        ordering = ['-period_start']

    def __str__(self):
        return f"{self.role_category} {self.period_days}d movement ({self.period_start})"


class EmployerHiringScore(models.Model):
    """Employer hiring activity score based on posting velocity and recency."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        MasterCompany,
        on_delete=models.CASCADE,
        related_name='hiring_scores',
    )
    period_start = models.DateField()
    period_end = models.DateField()
    total_postings = models.PositiveIntegerField(default=0)
    active_postings = models.PositiveIntegerField(default=0)
    unique_roles = models.PositiveIntegerField(default=0)
    hiring_score = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['company', 'period_start', 'period_end']
        ordering = ['-hiring_score']

    def __str__(self):
        return f"{self.company.name} score={self.hiring_score:.2f}"
