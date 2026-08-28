"""Deduplication and canonical job linking for ingested records."""

import hashlib
from datetime import timedelta
from typing import Dict, Any, Optional, Tuple

from django.db import transaction
from django.utils import timezone

from core.ingestion_models import CanonicalJob, JobSourceRecord


def _url_fingerprint(url: str) -> str:
    """Create a stable fingerprint from a URL for exact matching."""
    if not url:
        return ''
    normalized = url.strip().rstrip('/').lower()
    return hashlib.sha256(normalized.encode()).hexdigest()


def _strong_signal_key(company: str, title: str, location: str, date_str: str = '') -> str:
    """Create a dedup key from strong signals: company + title + location + date."""
    parts = [
        (company or '').strip().lower(),
        (title or '').strip().lower(),
        (location or '').strip().lower(),
        (date_str or '').strip(),
    ]
    return '|'.join(parts)


def _description_similarity(desc_a: str, desc_b: str) -> float:
    """
    Compute Jaccard similarity between two descriptions using word tokens.
    Returns 0.0 to 1.0.
    """
    if not desc_a or not desc_b:
        return 0.0
    tokens_a = set(desc_a.lower().split())
    tokens_b = set(desc_b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union) if union else 0.0


@transaction.atomic
def deduplicate_and_link(
    raw_job,
    normalized_data: Dict[str, Any],
    description_similarity_threshold: float = 0.7,
) -> Tuple[CanonicalJob, str]:
    """
    Find or create a CanonicalJob for the given raw_job and normalized data.

    Matching hierarchy:
      1. Exact URL fingerprint match
      2. Strong signal match (company + title + location + date)
      3. Description similarity (fallback, threshold-based)

    Returns (canonical_job, match_type).
    """
    url = raw_job.url or ''
    company_name = normalized_data.get('company_name_raw', '')
    title = normalized_data.get('title', '')
    location = normalized_data.get('location_raw', '')
    description = normalized_data.get('description', '')

    # 1. Exact URL match
    url_fp = _url_fingerprint(url)
    if url_fp:
        existing = JobSourceRecord.objects.filter(
            dedup_match_type='url_exact',
        ).select_related('canonical_job').filter(
            canonical_job__canonical_url=url,
        ).first()
        if existing:
            _create_source_record(existing.canonical_job, raw_job, 'url_exact')
            return existing.canonical_job, 'url_exact'

    # 2. Strong signal match (company + title + location + date within 7 days)
    strong_key = _strong_signal_key(company_name, title, location)
    cutoff = timezone.now() - timedelta(days=7)
    candidates = CanonicalJob.objects.filter(
        company_name_raw__iexact=company_name,
        normalized_title__iexact=normalized_data.get('normalized_title', title),
        location_raw__iexact=location,
        last_seen__gte=cutoff,
    ).order_by('-last_seen')

    if candidates.exists():
        canonical = candidates.first()
        _create_source_record(canonical, raw_job, 'strong_signal')
        return canonical, 'strong_signal'

    # 3. Description similarity fallback
    if description and len(description) > 100:
        recent_cutoff = timezone.now() - timedelta(days=14)
        recent_jobs = CanonicalJob.objects.filter(
            last_seen__gte=recent_cutoff,
        ).exclude(description='').order_by('-last_seen')[:200]

        for candidate in recent_jobs:
            sim = _description_similarity(description, candidate.description)
            if sim >= description_similarity_threshold:
                _create_source_record(candidate, raw_job, 'description_sim')
                return candidate, 'description_sim'

    # 4. No match — create new canonical job
    canonical = CanonicalJob.objects.create(
        canonical_url=url,
        title=title,
        normalized_title=normalized_data.get('normalized_title', title),
        company=normalized_data.get('company_master'),
        company_name_raw=company_name,
        location=normalized_data.get('location_master'),
        location_raw=location,
        description=description,
        work_mode=normalized_data.get('work_mode', 'unknown'),
        employment_type=normalized_data.get('employment_type', 'unknown'),
        seniority=normalized_data.get('seniority', 'unknown'),
        experience_text=normalized_data.get('experience_text', ''),
    )
    _create_source_record(canonical, raw_job, 'none')
    return canonical, 'none'


def _create_source_record(canonical_job: CanonicalJob, raw_job, match_type: str) -> JobSourceRecord:
    """Create a JobSourceRecord linking a raw job to its canonical job."""
    record, created = JobSourceRecord.objects.get_or_create(
        raw_job=raw_job,
        defaults={
            'canonical_job': canonical_job,
            'provider_code': raw_job.provider_code,
            'external_id': raw_job.external_id,
            'url': raw_job.url or '',
            'dedup_match_type': match_type,
        },
    )
    if not created and record.dedup_match_type == 'none':
        record.canonical_job = canonical_job
        record.dedup_match_type = match_type
        record.save(update_fields=['canonical_job', 'dedup_match_type'])
    return record
