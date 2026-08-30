"""Celery tasks for the ingestion pipeline."""

import logging
import re
import uuid
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


def _safe_celery_task_id(task_id) -> str:
    """Postgres celery_task_id is NOT NULL; Celery .run() often has request.id=None."""
    if task_id:
        return str(task_id)
    return str(uuid.uuid4())


@shared_task(bind=True, name='core.tasks.run_scheduled_ingestion')
def run_scheduled_ingestion(self):
    """
    Legacy nightly catch-all. Skipped when admin-managed schedules exist
    so the same providers are not ingested twice.
    """
    from core.models import IngestionSchedule

    if IngestionSchedule.objects.filter(enabled=True).exists():
        logger.info(
            'Skipping legacy nightly ingestion; enabled IngestionSchedule rows exist'
        )
        return {'skipped': True, 'reason': 'db_schedules_enabled'}

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
def run_provider_ingestion(self, source_id: str, keyword: str = '', location: str = '', country: str = '', max_pages: int = 1, min_salary: int = 0, max_salary: int = 0, employment_type: str = '', work_mode: str = '', role: str = '', posted_within: str = '', platforms=None):
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
    # Apify-only; SerpApi and others ignore this key.
    if platforms is not None:
        filters['platforms'] = platforms
    elif source.default_params.get('platforms'):
        filters['platforms'] = source.default_params.get('platforms')

    return _run_single_provider(source, filters, task_id=_safe_celery_task_id(self.request.id))


@shared_task(bind=True, name='core.tasks.run_all_provider_ingestions')
def run_all_provider_ingestions(self, keyword: str = '', location: str = '', country: str = '', max_pages: int = 1, min_salary: int = 0, max_salary: int = 0, employment_type: str = '', work_mode: str = '', role: str = '', posted_within: str = '', platforms=None):
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
        # Only applied by ApifyProvider; other connectors ignore it.
        if platforms is not None:
            filters['platforms'] = platforms
        elif source.default_params.get('platforms'):
            filters['platforms'] = source.default_params.get('platforms')

        try:
            results.append(
                _run_single_provider(
                    source, filters, task_id=_safe_celery_task_id(self.request.id),
                )
            )
        except Exception as exc:
            logger.error(f'Manual provider {source.provider_code} failed: {exc}')
            results.append({
                'success': False,
                'provider': source.provider_code,
                'error': str(exc),
            })

    return results


def _source_max_results(source: JobSource) -> int:
    """Authoritative job-count cap from Source Management."""
    params = source.default_params or {}
    for key in ("max_results", "max_pages"):
        raw = params.get(key)
        if raw in (None, "", 0, "0"):
            continue
        try:
            return max(1, int(raw))
        except (TypeError, ValueError):
            continue
    return 10


def _platform_key(name) -> str:
    """Compare board names across providers ("Naukri.com" == "Naukri")."""
    slug = re.sub(r"[^a-z0-9]+", "", str(name).lower())
    for suffix in ("couk", "com", "net", "org", "ph", "ch"):
        if len(slug) > len(suffix) + 2 and slug.endswith(suffix):
            return slug[: -len(suffix)]
    return slug


def _supported_platforms(provider_code: str) -> list:
    if provider_code == "serpapi":
        from core.providers.serpapi import SERPAPI_JOB_PLATFORMS

        return list(SERPAPI_JOB_PLATFORMS)
    if provider_code == "apify":
        from core.providers.apify import SUPPORTED_PLATFORMS

        return list(SUPPORTED_PLATFORMS)
    return []


def _sanitize_platforms(source: JobSource, requested) -> list:
    """Keep only platforms the target provider understands.

    A shared schedule may send one platform list to every provider, and board
    names differ per provider ("Naukri.com" vs "Naukri"). Matching on a
    normalized key avoids silently filtering every result away.
    """
    supported = _supported_platforms(source.provider_code)
    if not supported:
        return []
    by_key = {_platform_key(name): name for name in supported}

    if isinstance(requested, str):
        requested = [part.strip() for part in requested.split(",") if part.strip()]
    if not isinstance(requested, list):
        requested = []

    matched = []
    for item in requested:
        canonical = by_key.get(_platform_key(item))
        if canonical and canonical not in matched:
            matched.append(canonical)
    if matched:
        return matched

    configured = (source.default_params or {}).get("platforms")
    if isinstance(configured, list) and configured != requested:
        return _sanitize_platforms(source, configured)
    return []


def _apply_source_result_cap(source: JobSource, filters: dict) -> dict:
    """Force filters to respect the provider's configured Max results.

    Manual/schedule runs may pass their own max_pages; that value may only
    go *lower* than Source Management, never higher.
    """
    capped = dict(filters or {})
    source_cap = _source_max_results(source)
    requested = None
    for key in ("max_results", "max_pages"):
        raw = capped.get(key)
        if raw in (None, "", 0, "0"):
            continue
        try:
            requested = max(1, int(raw))
            break
        except (TypeError, ValueError):
            continue
    final = min(requested, source_cap) if requested is not None else source_cap
    capped["max_results"] = final
    # Prevent providers that still read max_pages from treating a higher
    # schedule/UI value as page count or job count.
    capped["max_pages"] = final
    requested_platforms = capped.get("platforms")
    if requested_platforms in (None, "", []):
        requested_platforms = (source.default_params or {}).get("platforms")
    platforms = _sanitize_platforms(source, requested_platforms)
    if platforms:
        capped["platforms"] = platforms
    else:
        capped.pop("platforms", None)
    return capped


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
        if source.default_params.get('platforms'):
            filters['platforms'] = source.default_params.get('platforms')

    filters = _apply_source_result_cap(source, filters)
    logger.info(
        "Ingestion %s capped at max_results=%s platforms=%s",
        source.provider_code,
        filters.get("max_results"),
        filters.get("platforms"),
    )

    run = IngestionRun.objects.create(
        provider=source,
        status=IngestionRun.Status.RUNNING,
        celery_task_id=_safe_celery_task_id(task_id),
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
        # Final safety net: never store more than Source Management allows.
        cap = int(filters.get("max_results") or _source_max_results(source))
        if len(raw_records) > cap:
            raw_records = raw_records[:cap]

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

        from core.services.daily_usage import bump_daily_usage
        bump_daily_usage(
            JobSource.objects.filter(pk=source.pk),
            extra={
                'health_status': JobSource.HealthStatus.HEALTHY,
                'last_run_at': now,
            },
        )
        try:
            provider.persist_credit_usage()
        except Exception:  # noqa: BLE001
            pass

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


def _schedule_platforms_for_source(schedule, source: JobSource) -> list | None:
    from core.services.scheduling import platforms_for_provider

    boards = platforms_for_provider(
        provider_code=source.provider_code,
        apify_platforms=schedule.apify_platforms,
        serpapi_platforms=schedule.serpapi_platforms,
        platforms=schedule.platforms,
    )
    return boards or None


@shared_task(bind=True, name='core.tasks.run_ingestion_schedule')
def run_ingestion_schedule(self, schedule_id: str):
    """Execute one due ingestion schedule and record success/failure."""
    from core.models import IngestionSchedule

    try:
        schedule = IngestionSchedule.objects.get(pk=schedule_id)
    except IngestionSchedule.DoesNotExist:
        return {'success': False, 'error': 'Schedule not found'}

    base_kwargs = {
        'keyword': schedule.keyword or '',
        'location': schedule.location or '',
        'country': schedule.country or '',
        'max_pages': schedule.max_pages or 1,
        'min_salary': schedule.min_salary or 0,
        'max_salary': schedule.max_salary or 0,
        'employment_type': schedule.employment_type or '',
        'work_mode': schedule.work_mode or '',
        'role': schedule.role or '',
        'posted_within': schedule.posted_within or '',
    }

    errors = []
    try:
        if schedule.source_id == 'all':
            sources = JobSource.objects.filter(is_active=True)
            for source in sources:
                if not source.has_auth_config():
                    errors.append(f'{source.provider_code}: credentials not configured')
                    continue
                platforms = _schedule_platforms_for_source(schedule, source)
                filters = {**base_kwargs}
                if platforms is not None:
                    filters['platforms'] = platforms
                result = _run_single_provider(
                    source,
                    filters,
                    task_id=_safe_celery_task_id(self.request.id),
                )
                if isinstance(result, dict) and not result.get('success', True):
                    errors.append(
                        f"{source.provider_code}: {result.get('error') or result.get('status')}"
                    )
        else:
            try:
                source = JobSource.objects.get(pk=schedule.source_id)
            except JobSource.DoesNotExist:
                raise ValueError('Source not found')
            platforms = _schedule_platforms_for_source(schedule, source)
            filters = {**base_kwargs}
            if platforms is not None:
                filters['platforms'] = platforms
            result = _run_single_provider(
                source,
                filters,
                task_id=_safe_celery_task_id(self.request.id),
            )
            if isinstance(result, dict) and not result.get('success', True):
                errors.append(str(result.get('error') or result.get('status') or 'failed'))

        schedule.last_run_status = 'error' if errors else 'success'
        schedule.last_error = '; '.join(errors)[:2000] if errors else ''
        schedule.save(update_fields=['last_run_status', 'last_error', 'updated_at'])
        return {
            'success': not errors,
            'schedule_id': schedule_id,
            'errors': errors,
        }
    except Exception as exc:
        logger.exception('Schedule %s failed: %s', schedule_id, exc)
        schedule.last_run_status = 'error'
        schedule.last_error = str(exc)[:2000]
        schedule.save(update_fields=['last_run_status', 'last_error', 'updated_at'])
        return {'success': False, 'schedule_id': schedule_id, 'error': str(exc)}


@shared_task(name='core.tasks.dispatch_due_ingestion_schedules')
def dispatch_due_ingestion_schedules():
    """
    Claim due schedules and enqueue execution.

    Runs every minute via Celery Beat. Uses row locks so concurrent beat
    workers do not double-fire the same schedule.
    """
    from django.db import transaction
    from django.db.models import F
    from core.models import IngestionSchedule
    from core.services.scheduling import calculate_next_run

    now = datetime.now(timezone.utc)
    claimed_ids = []

    with transaction.atomic():
        due_qs = (
            IngestionSchedule.objects
            .select_for_update(skip_locked=True)
            .filter(enabled=True, next_run__isnull=False, next_run__lte=now)
        )
        for schedule in due_qs:
            if schedule.total_runs > 0 and schedule.runs_completed >= schedule.total_runs:
                schedule.enabled = False
                schedule.save(update_fields=['enabled', 'updated_at'])
                continue

            schedule.runs_completed = F('runs_completed') + 1
            schedule.last_run = now
            schedule.last_run_status = ''
            schedule.last_error = ''
            schedule.save(update_fields=[
                'runs_completed', 'last_run', 'last_run_status', 'last_error', 'updated_at',
            ])
            schedule.refresh_from_db()

            exhausted = schedule.total_runs > 0 and schedule.runs_completed >= schedule.total_runs
            if schedule.frequency == 'once' or exhausted:
                schedule.enabled = False
                schedule.next_run = None
            else:
                schedule.next_run = calculate_next_run(
                    frequency=schedule.frequency,
                    time_str=schedule.time,
                    day_of_week=schedule.day_of_week,
                    day_of_month=schedule.day_of_month,
                    start_date=schedule.start_date,
                    after=now,
                )
            schedule.save(update_fields=['enabled', 'next_run', 'updated_at'])
            claimed_ids.append(str(schedule.id))

    for sid in claimed_ids:
        run_ingestion_schedule.delay(sid)

    if claimed_ids:
        logger.info('Dispatched %s due ingestion schedule(s)', len(claimed_ids))
    return {'dispatched': claimed_ids}
