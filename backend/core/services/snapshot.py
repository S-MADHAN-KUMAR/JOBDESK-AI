"""Job status updates, daily snapshots, and demand movement aggregation."""

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, Any

from django.db.models import Count, Q
from django.utils import timezone

from core.ingestion_models import (
    CanonicalJob,
    JobSnapshot,
    JobDemandMovement,
    EmployerHiringScore,
    MasterCompany,
)


def update_job_statuses(expire_days: int = 14) -> Dict[str, int]:
    """
    Mark jobs as expired if they haven't been seen within expire_days.
    Returns counts of updated jobs.
    """
    cutoff = timezone.now() - timedelta(days=expire_days)
    expired = CanonicalJob.objects.filter(
        status=CanonicalJob.Status.ACTIVE,
        last_seen__lt=cutoff,
    ).update(status=CanonicalJob.Status.EXPIRED)

    reactivated = CanonicalJob.objects.filter(
        status=CanonicalJob.Status.EXPIRED,
        last_seen__gte=cutoff,
    ).update(status=CanonicalJob.Status.ACTIVE)

    return {'expired': expired, 'reactivated': reactivated}


def create_daily_snapshot(snapshot_date: date = None) -> int:
    """
    Create a snapshot for all canonical jobs on the given date.
    Returns the number of snapshots created.
    """
    if snapshot_date is None:
        snapshot_date = date.today()

    jobs = CanonicalJob.objects.filter(
        status__in=[CanonicalJob.Status.ACTIVE, CanonicalJob.Status.EXPIRED]
    ).values_list('id', 'status')

    snapshots = []
    for job_id, status in jobs:
        snapshots.append(JobSnapshot(
            canonical_job_id=job_id,
            snapshot_date=snapshot_date,
            is_active=(status == CanonicalJob.Status.ACTIVE),
            source_count=0,
        ))

    if snapshots:
        JobSnapshot.objects.bulk_create(
            snapshots,
            ignore_conflicts=True,
            batch_size=1000,
        )

    return len(snapshots)


def aggregate_daily_snapshots() -> Dict[str, Any]:
    """
    Run the full daily snapshot pipeline:
    1. Update expired jobs
    2. Create today's snapshot
    3. Update employer hiring scores
    """
    from django.conf import settings
    expire_days = getattr(settings, 'INGESTION_EXPIRE_DAYS', 14)

    status_updates = update_job_statuses(expire_days)
    snapshot_count = create_daily_snapshot()
    _update_employer_scores()

    return {
        'snapshot_date': str(date.today()),
        'snapshots_created': snapshot_count,
        'status_updates': status_updates,
    }


def compute_demand_movements() -> Dict[str, Any]:
    """
    Compute 7, 30, 60, 90-day demand movements per role category.
    """
    today = date.today()
    periods = [7, 30, 60, 90]
    results = []

    classifications = CanonicalJob.objects.filter(
        classification__isnull=False,
    ).values(
        'classification__role_category',
    ).distinct()

    for cls in classifications:
        role = cls['classification__role_category']
        if not role:
            continue

        for period_days in periods:
            period_start = today - timedelta(days=period_days)
            period_end = today

            active_start = JobSnapshot.objects.filter(
                snapshot_date=period_start,
                is_active=True,
                canonical_job__classification__role_category=role,
            ).count()

            active_end = JobSnapshot.objects.filter(
                snapshot_date=period_end,
                is_active=True,
                canonical_job__classification__role_category=role,
            ).count()

            new_postings = CanonicalJob.objects.filter(
                classification__role_category=role,
                first_seen__date__gte=period_start,
                first_seen__date__lte=period_end,
            ).count()

            expired_postings = CanonicalJob.objects.filter(
                classification__role_category=role,
                status=CanonicalJob.Status.EXPIRED,
                updated_at__date__gte=period_start,
                updated_at__date__lte=period_end,
            ).count()

            net_change = active_end - active_start
            change_pct = (net_change / active_start * 100) if active_start > 0 else 0.0

            movement, _ = JobDemandMovement.objects.update_or_create(
                role_category=role,
                period_days=period_days,
                period_start=period_start,
                defaults={
                    'period_end': period_end,
                    'active_jobs_start': active_start,
                    'active_jobs_end': active_end,
                    'new_postings': new_postings,
                    'expired_postings': expired_postings,
                    'net_change': net_change,
                    'change_percentage': round(change_pct, 2),
                },
            )
            results.append({
                'role': role,
                'period_days': period_days,
                'net_change': net_change,
                'change_pct': round(change_pct, 2),
            })

    return {'movements_computed': len(results), 'results': results[:20]}


def _update_employer_scores() -> None:
    """Compute hiring scores for all companies based on recent activity."""
    today = date.today()
    periods = [
        (today - timedelta(days=30), today),
        (today - timedelta(days=90), today),
    ]

    for period_start, period_end in periods:
        companies = CanonicalJob.objects.filter(
            company__isnull=False,
        ).values(
            'company_id',
        ).annotate(
            total_postings=Count('id'),
            active_postings=Count('id', filter=Q(status=CanonicalJob.Status.ACTIVE)),
            unique_roles=Count('classification__role_category', distinct=True),
        )

        for stats in companies:
            company_id = stats['company_id']
            total = stats['total_postings']
            active = stats['active_postings']
            roles = stats['unique_roles']

            score = (active * 1.0) + (total * 0.3) + (roles * 2.0)

            EmployerHiringScore.objects.update_or_create(
                company_id=company_id,
                period_start=period_start,
                period_end=period_end,
                defaults={
                    'total_postings': total,
                    'active_postings': active,
                    'unique_roles': roles,
                    'hiring_score': round(score, 2),
                },
            )
