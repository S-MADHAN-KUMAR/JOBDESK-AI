"""Celery tasks for the ingestion pipeline."""

import logging
from datetime import datetime, timezone

from celery import shared_task
from django.db import transaction
from django.db.models import F

from core.models import IngestionRun, JobSource, RawJob
from core.providers import get_provider, ProviderError
from core.services.normalizer import normalize_raw_job
from core.services.deduplication import deduplicate_and_link
from core.services.classifier import classify_job
from core.services.snapshot import (
    aggregate_daily_snapshots,
    compute_demand_movements,
)

logger = logging.getLogger('core')


def _truncate(value: str, max_length: int = 255) -> str:
    """Truncate a string to max_length, appending '...' if trimmed."""
    if not isinstance(value, str):
        value = str(value) if value else ''
    if len(value) > max_length:
        return value[:max_length - 3] + '...'
    return value


@shared_task(bind=True, name='core.tasks.run_scheduled_ingestion')
def run_scheduled_ingestion(self):
    """
    Main ingestion pipeline task. Runs all active providers sequentially.
    Scheduled via Celery Beat at configured hour/minute.
    """
    logger.info('Starting scheduled ingestion pipeline')
    active_sources = JobSource.objects.filter(is_active=True)
    results = []

    for source in active_sources:
        try:
            result = _run_single_provider(source)
            results.append(result)
        except Exception as exc:
            logger.error(f'Provider {source.provider_code} failed: {exc}')
            results.append({
                'provider': source.provider_code,
                'success': False,
                'error': str(exc),
            })

    logger.info(f'Ingestion pipeline completed: {len(results)} providers')
    return results


@shared_task(bind=True, name='core.tasks.run_provider_ingestion')
def run_provider_ingestion(self, source_id: str, keyword: str = '', location: str = '', country: str = '', max_pages: int = 1, min_salary: int = 0, max_salary: int = 0, employment_type: str = '', work_mode: str = '', role: str = '', posted_within: str = ''):
    """
    Run ingestion for a single provider (manual trigger).
    """
    try:
        source = JobSource.objects.get(pk=source_id)
    except JobSource.DoesNotExist:
        return {'success': False, 'error': 'Source not found'}

    if not source.is_active:
        return {'success': False, 'error': f'{source.name} is disabled'}

    if not source.has_auth_config():
        return {'success': False, 'error': 'API credentials not configured'}

    filters = {
        'keyword': keyword or source.default_params.get('keyword', ''),
        'location': location or source.default_params.get('location', ''),
        'country': country or source.default_params.get('country', ''),
        'max_pages': max_pages,
        'min_salary': min_salary or source.default_params.get('min_salary', 0),
        'max_salary': max_salary or source.default_params.get('max_salary', 0),
        'employment_type': employment_type or source.default_params.get('employment_type', ''),
        'work_mode': work_mode or source.default_params.get('work_mode', ''),
        'role': role or source.default_params.get('role', ''),
        'posted_within': posted_within or source.default_params.get('posted_within', ''),
    }

    return _run_single_provider(source, filters, task_id=self.request.id)


@shared_task(bind=True, name='core.tasks.run_all_provider_ingestions')
def run_all_provider_ingestions(self, keyword: str = '', location: str = '', country: str = '', max_pages: int = 1, min_salary: int = 0, max_salary: int = 0, employment_type: str = '', work_mode: str = '', role: str = '', posted_within: str = ''):
    """
    Run manual ingestion for all active providers using the same ad-hoc filters.
    """
    active_sources = JobSource.objects.filter(is_active=True)
    results = []

    for source in active_sources:
        if not source.has_auth_config():
            results.append({
                'success': False,
                'provider': source.provider_code,
                'error': 'API credentials not configured',
            })
            continue

        filters = {
            'keyword': keyword or source.default_params.get('keyword', ''),
            'location': location or source.default_params.get('location', ''),
            'country': country or source.default_params.get('country', ''),
            'max_pages': max_pages,
            'min_salary': min_salary or source.default_params.get('min_salary', 0),
            'max_salary': max_salary or source.default_params.get('max_salary', 0),
            'employment_type': employment_type or source.default_params.get('employment_type', ''),
            'work_mode': work_mode or source.default_params.get('work_mode', ''),
            'role': role or source.default_params.get('role', ''),
            'posted_within': posted_within or source.default_params.get('posted_within', ''),
        }

        try:
            results.append(_run_single_provider(source, filters, task_id=self.request.id))
        except Exception as exc:
            logger.error(f'Manual provider {source.provider_code} failed: {exc}')
            results.append({
                'success': False,
                'provider': source.provider_code,
                'error': str(exc),
            })

    return results


def _run_single_provider(source: JobSource, filters: dict = None, task_id: str = ''):
    """
    Core ingestion logic for a single provider:
    1. Fetch jobs via provider
    2. Store raw jobs
    3. Normalize, deduplicate, classify
    """
    now = datetime.now(timezone.utc)

    if filters is None:
        filters = {
            'keyword': source.default_params.get('keyword', ''),
            'location': source.default_params.get('location', ''),
            'country': source.default_params.get('country', ''),
            'max_pages': source.default_params.get('max_pages', 1),
            'min_salary': source.default_params.get('min_salary', 0),
            'max_salary': source.default_params.get('max_salary', 0),
            'employment_type': source.default_params.get('employment_type', ''),
            'work_mode': source.default_params.get('work_mode', ''),
            'role': source.default_params.get('role', ''),
            'posted_within': source.default_params.get('posted_within', ''),
        }

    run = IngestionRun.objects.create(
        provider=source,
        status=IngestionRun.Status.RUNNING,
        celery_task_id=task_id,
        started_at=now,
    )

    errors = []
    fetched = 0
    normalized_count = 0
    deduped_count = 0
    classified_count = 0

    try:
        provider = get_provider(source)
        raw_records = provider.search_jobs(filters)

        for record in raw_records:
            try:
                with transaction.atomic():
                    normalized = provider.normalize_source_record(record)
                    raw_job = RawJob.objects.create(
                        ingestion_run=run,
                        provider_code=source.provider_code,
                        external_id=_truncate(normalized['external_id']),
                        url=normalized.get('url', ''),
                        title=_truncate(normalized.get('title', '')),
                        company=_truncate(normalized.get('company', '')),
                        location=_truncate(normalized.get('location', '')),
                        description=normalized.get('description', ''),
                        raw_payload=record,
                    )
                    fetched += 1

                    norm_data = normalize_raw_job(raw_job)
                    normalized_count += 1

                    canonical_job, match_type = deduplicate_and_link(raw_job, norm_data)
                    deduped_count += 1

                    classification = classify_job(canonical_job)
                    classified_count += 1

            except Exception as exc:
                errors.append({'error': str(exc), 'external_id': str(record)[:200]})

        run.fetched_count = fetched
        run.error_count = len(errors)
        run.error_logs = errors
        run.status = (
            IngestionRun.Status.COMPLETED if not errors else IngestionRun.Status.PARTIAL
        )
        run.ended_at = datetime.now(timezone.utc)
        run.save()

        JobSource.objects.filter(pk=source.pk).update(
            current_daily_uses=F('current_daily_uses') + 1,
            health_status=JobSource.HealthStatus.HEALTHY,
            last_run_at=now,
        )

        return {
            'success': True,
            'provider': source.provider_code,
            'status': run.status,
            'run_id': str(run.id),
            'fetched_count': fetched,
            'normalized_count': normalized_count,
            'deduped_count': deduped_count,
            'classified_count': classified_count,
            'error_count': len(errors),
        }

    except ProviderError as exc:
        run.status = IngestionRun.Status.FAILED
        run.ended_at = datetime.now(timezone.utc)
        run.error_logs = [{'error': str(exc)}]
        run.save()
        source.health_status = JobSource.HealthStatus.FAILED
        source.last_run_at = now
        source.save(update_fields=['health_status', 'last_run_at'])
        return {
            'success': False,
            'provider': source.provider_code,
            'status': run.status,
            'error': str(exc),
        }


@shared_task(name='core.tasks.aggregate_daily_snapshots')
def run_aggregate_daily_snapshots():
    """Celery task wrapper for daily snapshot aggregation."""
    return aggregate_daily_snapshots()


@shared_task(name='core.tasks.compute_demand_movements_task')
def run_compute_demand_movements():
    """Celery task wrapper for demand movement computation."""
    return compute_demand_movements()
