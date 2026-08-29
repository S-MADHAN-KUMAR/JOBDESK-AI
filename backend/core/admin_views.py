"""Admin API views for ingestion pipeline monitoring, data quality, and taxonomy."""

import os
from datetime import datetime, timezone, timedelta

from django.db.models import Count, Q, Avg, Min, Max
from django.utils import timezone as dj_timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from django.core.exceptions import ValidationError

from core.ingestion_models import (
    CanonicalJob,
    JobClassification,
    JobDemandMovement,
    JobSnapshot,
    JobSourceRecord,
    EmployerHiringScore,
    MasterCompany,
    MasterLocation,
    MasterJobRole,
    MasterTechnology,
    MasterSkill,
)
from core.models import IngestionRun, JobSource, RawJob
from core.permissions import IsAdmin, IsCEOOrManagement, IsMarketAnalyst, IsTrainingManager, IsRecruitmentTeam
from core.tasks import (
    run_all_provider_ingestions,
    run_provider_ingestion,
    run_aggregate_daily_snapshots,
)


class StandardResultsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


# ---------------------------------------------------------------------------
# Ingestion run monitoring
# ---------------------------------------------------------------------------

class IngestionRunViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve ingestion runs with provider details."""
    permission_classes = [IsAdmin]
    pagination_class = StandardResultsPagination

    def get_queryset(self):
        qs = IngestionRun.objects.select_related('provider').order_by('-created_at')
        provider_code = self.request.query_params.get('provider')
        run_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if provider_code:
            qs = qs.filter(provider__provider_code=provider_code)
        if run_status:
            qs = qs.filter(status=run_status)
        if search:
            qs = qs.filter(
                Q(provider__name__icontains=search) |
                Q(provider__provider_code__icontains=search)
            )
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def get_serializer_class(self):
        from core.serializers import IngestionRunSerializer
        return IngestionRunSerializer

    @action(detail=True, methods=['get'], url_path='errors')
    def run_errors(self, request, pk=None):
        run = self.get_object()
        return Response({
            'run_id': str(run.id),
            'provider': run.provider.provider_code,
            'error_count': run.error_count,
            'errors': run.error_logs,
    })


class CanonicalJobViewSet(viewsets.ReadOnlyModelViewSet):
    """List and retrieve canonical jobs with search, pagination, and bulk delete."""
    permission_classes = [IsAdmin]
    pagination_class = StandardResultsPagination

    def get_serializer_class(self):
        from core.serializers import CanonicalJobSerializer
        return CanonicalJobSerializer

    def get_queryset(self):
        qs = CanonicalJob.objects.select_related('company', 'location').order_by('-last_seen')
        search = self.request.query_params.get('search', '').strip()
        work_mode = self.request.query_params.get('work_mode')
        seniority = self.request.query_params.get('seniority')
        job_status = self.request.query_params.get('status')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(normalized_title__icontains=search) |
                Q(company_name_raw__icontains=search) |
                Q(location_raw__icontains=search)
            )
        if work_mode:
            qs = qs.filter(work_mode=work_mode)
        if seniority:
            qs = qs.filter(seniority=seniority)
        if job_status:
            qs = qs.filter(status=job_status)
        return qs


@api_view(['POST'])
@permission_classes([IsAdmin])
def trigger_manual_run(request):
    """Trigger an ad-hoc ingestion run for a specific provider or all providers."""
    source_id = request.data.get('source_id')
    keyword = request.data.get('keyword', '')
    location = request.data.get('location', '')
    country = request.data.get('country', '')
    max_pages = int(request.data.get('max_pages', 1))
    min_salary = int(request.data.get('min_salary', 0) or 0)
    max_salary = int(request.data.get('max_salary', 0) or 0)
    employment_type = request.data.get('employment_type', '')
    work_mode = request.data.get('work_mode', '')
    role = request.data.get('role', '')
    posted_within = request.data.get('posted_within', '')
    platforms = request.data.get('platforms')

    if not source_id:
        return Response(
            {'success': False, 'message': 'source_id is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if source_id == 'all':
        task = run_all_provider_ingestions.delay(
            keyword=keyword,
            location=location,
            country=country,
            max_pages=max_pages,
            min_salary=min_salary,
            max_salary=max_salary,
            employment_type=employment_type,
            work_mode=work_mode,
            role=role,
            posted_within=posted_within,
            platforms=platforms,
        )
        return Response({
            'success': True,
            'message': 'Ingestion tasks queued for all active providers',
            'task_id': task.id,
            'provider': 'all',
        })

    try:
        source = JobSource.objects.get(pk=source_id)
    except ValidationError:
        return Response(
            {'success': False, 'message': 'Invalid source_id'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except JobSource.DoesNotExist:
        return Response(
            {'success': False, 'message': 'Source not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    task = run_provider_ingestion.delay(
        source_id=str(source.id),
        keyword=keyword,
        location=location,
        country=country,
        max_pages=max_pages,
        min_salary=min_salary,
        max_salary=max_salary,
        employment_type=employment_type,
        work_mode=work_mode,
        role=role,
        posted_within=posted_within,
        platforms=platforms,
    )

    return Response({
        'success': True,
        'message': f'Ingestion task queued for {source.name}',
        'task_id': task.id,
        'provider': source.provider_code,
    })


# ---------------------------------------------------------------------------
# Deletion endpoints
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAdmin])
def bulk_delete_ingestion_runs(request):
    """Delete ingestion runs and ALL associated data (raw jobs, source records, etc.)."""
    ids = request.data.get('ids') or []
    if not ids:
        return Response(
            {'success': False, 'message': 'No run IDs provided.', 'deleted': 0},
            status=status.HTTP_400_BAD_REQUEST,
        )
    runs = IngestionRun.objects.filter(id__in=ids)
    count = runs.count()

    raw_job_ids = list(RawJob.objects.filter(ingestion_run__in=runs).values_list('id', flat=True))
    source_record_count = JobSourceRecord.objects.filter(raw_job_id__in=raw_job_ids).count()
    JobSourceRecord.objects.filter(raw_job_id__in=raw_job_ids).delete()

    canonical_ids_from_sources = list(
        JobSourceRecord.objects.filter(
            raw_job_id__in=raw_job_ids
        ).values_list('canonical_job_id', flat=True)
    )

    runs.delete()

    orphan_canonicals = CanonicalJob.objects.filter(
        id__in=canonical_ids_from_sources
    ).filter(source_records__isnull=True)
    orphan_canonicals.delete()

    return Response({
        'success': True,
        'deleted': count,
        'message': f'Deleted {count} ingestion run(s), {len(raw_job_ids)} raw job(s), and {source_record_count} source record(s).',
    })


@api_view(['POST'])
@permission_classes([IsAdmin])
def bulk_delete_canonical_jobs(request):
    """Delete canonical jobs and ALL linked records (source_records, classifications, snapshots)."""
    ids = request.data.get('ids') or []
    if not ids:
        return Response(
            {'success': False, 'message': 'No job IDs provided.', 'deleted': 0},
            status=status.HTTP_400_BAD_REQUEST,
        )
    canonicals = CanonicalJob.objects.filter(id__in=ids)
    count = canonicals.count()

    source_count = JobSourceRecord.objects.filter(canonical_job__in=canonicals).count()
    classification_count = JobClassification.objects.filter(canonical_job__in=canonicals).count()
    snapshot_count = JobSnapshot.objects.filter(canonical_job__in=canonicals).count()

    canonicals.delete()

    return Response({
        'success': True,
        'deleted': count,
        'message': (
            f'Deleted {count} canonical job(s), {source_count} source record(s), '
            f'{classification_count} classification(s), {snapshot_count} snapshot(s).'
        ),
    })


@api_view(['POST'])
@permission_classes([IsAdmin])
def purge_all_ingestion_data(request):
    """
    Nuclear option: Delete ALL ingestion pipeline data.
    Requires confirmation token 'CONFIRM_PURGE' in request body.
    """
    confirm = request.data.get('confirm', '')
    if confirm != 'CONFIRM_PURGE':
        return Response(
            {'success': False, 'message': 'Send confirm="CONFIRM_PURGE" to proceed.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Use ORM deletes (not raw TRUNCATE) so table names stay correct and Neon
    # transaction-mode poolers do not reject the statement.
    deleted = {
        'snapshots': JobSnapshot.objects.all().delete()[0],
        'demand_movements': JobDemandMovement.objects.all().delete()[0],
        'employer_scores': EmployerHiringScore.objects.all().delete()[0],
        'classifications': JobClassification.objects.all().delete()[0],
        'source_records': JobSourceRecord.objects.all().delete()[0],
        'canonical_jobs': CanonicalJob.objects.all().delete()[0],
        'raw_jobs': RawJob.objects.all().delete()[0],
        'ingestion_runs': IngestionRun.objects.all().delete()[0],
    }

    remaining = {
        'ingestion_runs': IngestionRun.objects.count(),
        'raw_jobs': RawJob.objects.count(),
        'canonical_jobs': CanonicalJob.objects.count(),
        'source_records': JobSourceRecord.objects.count(),
        'classifications': JobClassification.objects.count(),
        'snapshots': JobSnapshot.objects.count(),
        'demand_movements': JobDemandMovement.objects.count(),
        'employer_scores': EmployerHiringScore.objects.count(),
    }

    return Response({
        'success': True,
        'message': 'All ingestion pipeline data purged.',
        'deleted': deleted,
        'remaining': remaining,
    })


# ---------------------------------------------------------------------------
# Pipeline health & data quality
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAdmin])
def pipeline_health(request):
    """Get pipeline health metrics across all providers."""
    total_raw = RawJob.objects.count()
    total_canonical = CanonicalJob.objects.count()
    total_source_records = JobSourceRecord.objects.count()

    dedup_rate = 0.0
    if total_raw > 0:
        dedup_rate = round((1 - total_canonical / total_raw) * 100, 1) if total_raw > 0 else 0

    provider_stats = RawJob.objects.values('provider_code').annotate(
        total=Count('id'),
    ).order_by('-total')

    recent_runs = IngestionRun.objects.order_by('-created_at')[:10]

    return Response({
        'total_raw_jobs': total_raw,
        'total_canonical_jobs': total_canonical,
        'total_source_records': total_source_records,
        'deduplication_rate_pct': dedup_rate,
        'provider_stats': list(provider_stats),
        'recent_runs': [
            {
                'id': str(r.id),
                'provider': r.provider.provider_code if r.provider else 'unknown',
                'status': r.status,
                'fetched_count': r.fetched_count,
                'error_count': r.error_count,
                'started_at': r.started_at.isoformat() if r.started_at else None,
                'ended_at': r.ended_at.isoformat() if r.ended_at else None,
            }
            for r in recent_runs
        ],
    })


@api_view(['GET'])
@permission_classes([IsAdmin])
def data_quality_metrics(request):
    """Get data quality metrics: missing fields, confidence distributions."""
    total = CanonicalJob.objects.count()
    if total == 0:
        return Response({
            'total_canonical_jobs': 0,
            'missing_salary_pct': 0,
            'missing_experience_pct': 0,
            'missing_company_pct': 0,
            'missing_location_pct': 0,
            'confidence_distribution': [],
            'work_mode_distribution': [],
            'seniority_distribution': [],
        })

    missing_salary = CanonicalJob.objects.filter(salary_text='').count()
    missing_experience = CanonicalJob.objects.filter(experience_text='').count()
    missing_company = CanonicalJob.objects.filter(company_name_raw='').count()
    missing_location = CanonicalJob.objects.filter(location_raw='').count()

    confidence_dist = JobClassification.objects.values(
        'confidence_score',
    ).annotate(count=Count('id')).order_by('confidence_score')

    work_mode_dist = CanonicalJob.objects.values('work_mode').annotate(
        count=Count('id'),
    ).order_by('-count')

    seniority_dist = CanonicalJob.objects.values('seniority').annotate(
        count=Count('id'),
    ).order_by('-count')

    return Response({
        'total_canonical_jobs': total,
        'missing_salary_pct': round(missing_salary / total * 100, 1),
        'missing_experience_pct': round(missing_experience / total * 100, 1),
        'missing_company_pct': round(missing_company / total * 100, 1),
        'missing_location_pct': round(missing_location / total * 100, 1),
        'confidence_distribution': [
            {'score': c['confidence_score'], 'count': c['count']}
            for c in confidence_dist
        ],
        'work_mode_distribution': list(work_mode_dist),
        'seniority_distribution': list(seniority_dist),
    })


@api_view(['GET'])
@permission_classes([IsAdmin])
def confidence_monitoring(request):
    """Inspect AI classification confidence distributions."""
    avg_confidence = JobClassification.objects.aggregate(
        avg=Avg('confidence_score'),
    )['avg'] or 0.0

    low_confidence = JobClassification.objects.filter(
        confidence_score__lt=0.5,
    ).select_related('canonical_job').order_by('confidence_score')[:20]

    method_dist = JobClassification.objects.values(
        'classification_method',
    ).annotate(
        count=Count('id'),
        avg_confidence=Avg('confidence_score'),
    )

    return Response({
        'average_confidence': round(avg_confidence, 3),
        'total_classified': JobClassification.objects.count(),
        'method_distribution': list(method_dist),
        'low_confidence_jobs': [
            {
                'id': str(c.canonical_job_id),
                'title': c.canonical_job.title,
                'company': c.canonical_job.company_name_raw,
                'role_category': c.role_category,
                'confidence': c.confidence_score,
                'method': c.classification_method,
            }
            for c in low_confidence
        ],
    })


# ---------------------------------------------------------------------------
# Raw vs Normalized inspector
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAdmin])
def raw_vs_normalized(request, canonical_job_id):
    """Compare raw source records against the normalized canonical job."""
    try:
        canonical = CanonicalJob.objects.get(pk=canonical_job_id)
    except CanonicalJob.DoesNotExist:
        return Response(
            {'error': 'Canonical job not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    source_records = JobSourceRecord.objects.filter(
        canonical_job=canonical,
    ).select_related('raw_job').order_by('-created_at')

    classification = None
    if hasattr(canonical, 'classification'):
        cls = canonical.classification
        classification = {
            'role_category': cls.role_category,
            'primary_technologies': cls.primary_technologies,
            'secondary_technologies': cls.secondary_technologies,
            'skills': cls.skills,
            'confidence_score': cls.confidence_score,
            'method': cls.classification_method,
        }

    return Response({
        'canonical_job': {
            'id': str(canonical.id),
            'title': canonical.title,
            'normalized_title': canonical.normalized_title,
            'company_name_raw': canonical.company_name_raw,
            'company_id': str(canonical.company_id) if canonical.company_id else None,
            'location_raw': canonical.location_raw,
            'location_id': str(canonical.location_id) if canonical.location_id else None,
            'work_mode': canonical.work_mode,
            'employment_type': canonical.employment_type,
            'seniority': canonical.seniority,
            'experience_text': canonical.experience_text,
            'salary_text': canonical.salary_text,
            'status': canonical.status,
            'first_seen': canonical.first_seen.isoformat(),
            'last_seen': canonical.last_seen.isoformat(),
        },
        'classification': classification,
        'source_records': [
            {
                'id': str(sr.id),
                'provider_code': sr.provider_code,
                'external_id': sr.external_id,
                'url': sr.url,
                'match_type': sr.dedup_match_type,
                'raw_title': sr.raw_job.title if sr.raw_job else '',
                'raw_company': sr.raw_job.company if sr.raw_job else '',
                'raw_location': sr.raw_job.location if sr.raw_job else '',
                'raw_description': (sr.raw_job.description[:500] if sr.raw_job else ''),
                'fetched_at': sr.raw_job.fetched_at.isoformat() if sr.raw_job else None,
            }
            for sr in source_records
        ],
    })


# ---------------------------------------------------------------------------
# Demand movement & hiring scores
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAdmin])
def demand_movements(request):
    """Get demand movement data across role categories and periods."""
    period = request.query_params.get('period')
    movements = JobDemandMovement.objects.all()
    if period:
        movements = movements.filter(period_days=int(period))

    return Response({
        'movements': [
            {
                'id': str(m.id),
                'role_category': m.role_category,
                'period_days': m.period_days,
                'period_start': str(m.period_start),
                'period_end': str(m.period_end),
                'active_jobs_start': m.active_jobs_start,
                'active_jobs_end': m.active_jobs_end,
                'new_postings': m.new_postings,
                'expired_postings': m.expired_postings,
                'net_change': m.net_change,
                'change_percentage': m.change_percentage,
            }
            for m in movements[:100]
        ],
    })


@api_view(['POST'])
@permission_classes([IsAdmin]
)
def trigger_snapshot(request):
    """Manually trigger snapshot aggregation."""
    task = run_aggregate_daily_snapshots.delay()
    return Response({
        'success': True,
        'message': 'Snapshot aggregation task queued',
        'task_id': task.id,
    })


# ---------------------------------------------------------------------------
# Master data / Taxonomy management
# ---------------------------------------------------------------------------

class MasterBulkDeleteMixin:
    """POST /bulk-delete/ with {ids: [...]} for master-data ViewSets."""

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        ids = request.data.get('ids') or []
        if not ids:
            return Response({
                'success': False,
                'deleted': 0,
                'message': 'No IDs provided.',
            }, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = self.get_queryset().model.objects.filter(id__in=ids).delete()
        return Response({
            'success': True,
            'deleted': deleted,
            'message': f'Deleted {deleted} record(s).',
        })


class MasterCompanyViewSet(MasterBulkDeleteMixin, viewsets.ModelViewSet):
    """CRUD for master companies."""
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        qs = MasterCompany.objects.all().order_by('normalized_name')
        q = self.request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(
                Q(name__icontains=q) | Q(normalized_name__icontains=q)
            )
        return qs

    def get_serializer_class(self):
        from core.serializers import MasterCompanySerializer
        return MasterCompanySerializer


class MasterLocationViewSet(MasterBulkDeleteMixin, viewsets.ModelViewSet):
    """CRUD for master locations."""
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        qs = MasterLocation.objects.all().order_by('normalized')
        q = self.request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(
                Q(raw_text__icontains=q) | Q(normalized__icontains=q)
            )
        return qs

    def get_serializer_class(self):
        from core.serializers import MasterLocationSerializer
        return MasterLocationSerializer


class MasterJobRoleViewSet(MasterBulkDeleteMixin, viewsets.ModelViewSet):
    """CRUD for job role taxonomy."""
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        return MasterJobRole.objects.all().order_by('name')

    def get_serializer_class(self):
        from core.serializers import MasterJobRoleSerializer
        return MasterJobRoleSerializer


class MasterTechnologyViewSet(MasterBulkDeleteMixin, viewsets.ModelViewSet):
    """CRUD for technology taxonomy."""
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        return MasterTechnology.objects.all().order_by('name')

    def get_serializer_class(self):
        from core.serializers import MasterTechnologySerializer
        return MasterTechnologySerializer


class MasterSkillViewSet(MasterBulkDeleteMixin, viewsets.ModelViewSet):
    """CRUD for skill taxonomy."""
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_queryset(self):
        return MasterSkill.objects.select_related('technology').all().order_by('name')

    def get_serializer_class(self):
        from core.serializers import MasterSkillSerializer
        return MasterSkillSerializer


# ---------------------------------------------------------------------------
# Employer hiring scores
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAdmin])
def employer_scores(request):
    """Get employer hiring scores."""
    scores = EmployerHiringScore.objects.select_related('company').order_by('-hiring_score')[:50]
    return Response({
        'scores': [
            {
                'id': str(s.id),
                'company_name': s.company.name,
                'company_id': str(s.company_id),
                'period_start': str(s.period_start),
                'period_end': str(s.period_end),
                'total_postings': s.total_postings,
                'active_postings': s.active_postings,
                'unique_roles': s.unique_roles,
                'hiring_score': s.hiring_score,
            }
            for s in scores
        ],
    })


# ---------------------------------------------------------------------------
# LLM Configuration
# ---------------------------------------------------------------------------

LLM_PROVIDERS = {
    'none': {'label': 'Disabled', 'models': []},
    'openai': {'label': 'OpenAI', 'models': ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']},
    'anthropic': {'label': 'Anthropic', 'models': ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229']},
    'groq': {'label': 'Groq', 'models': ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']},
}


@api_view(['GET'])
@permission_classes([IsAdmin])
def llm_config(request):
    """Get current LLM configuration."""
    from django.conf import settings as django_settings
    provider = getattr(django_settings, 'LLM_CLASSIFICATION_PROVIDER', 'none')
    model = getattr(django_settings, 'LLM_CLASSIFICATION_MODEL', '')
    return Response({
        'provider': provider,
        'model': model,
        'providers': LLM_PROVIDERS,
    })


@api_view(['POST'])
@permission_classes([IsAdmin])
def update_llm_config(request):
    """Update LLM configuration (persists to .env.local)."""
    provider = request.data.get('provider', 'none')
    model = request.data.get('model', '')

    if provider not in LLM_PROVIDERS:
        return Response({'error': 'Invalid provider'}, status=400)

    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env.local')
    lines = []
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            lines = f.readlines()

    updates = {
        'LLM_CLASSIFICATION_PROVIDER': provider,
        'LLM_CLASSIFICATION_MODEL': model,
    }

    for key, val in updates.items():
        found = False
        for i, line in enumerate(lines):
            if line.strip().startswith(f'{key}='):
                lines[i] = f'{key}={val}\n'
                found = True
                break
        if not found:
            lines.append(f'{key}={val}\n')

    with open(env_path, 'w') as f:
        f.writelines(lines)

    return Response({'success': True, 'provider': provider, 'model': model})


# ---------------------------------------------------------------------------
# CEO / Management Intelligence
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsCEOOrManagement])
def ceo_executive_summary(request):
    """CEO Executive Summary: job volume, active vs expired, top hiring hubs."""
    from django.db.models import Count, Q
    from django.utils import timezone as tz

    total_jobs = CanonicalJob.objects.count()
    active_jobs = CanonicalJob.objects.filter(status='active').count()
    expired_jobs = CanonicalJob.objects.filter(status='expired').count()

    top_hubs = (
        CanonicalJob.objects
        .exclude(location_raw='')
        .values('location_raw')
        .annotate(job_count=Count('id'))
        .order_by('-job_count')[:10]
    )

    top_companies = (
        CanonicalJob.objects
        .exclude(company_name_raw='')
        .values('company_name_raw')
        .annotate(job_count=Count('id'))
        .order_by('-job_count')[:10]
    )

    top_roles = (
        JobClassification.objects
        .values('role_category')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    recent_snapshots = JobSnapshot.objects.order_by('-snapshot_date')[:30]
    daily_active = {}
    for snap in recent_snapshots:
        day = str(snap.snapshot_date)
        if day not in daily_active:
            daily_active[day] = 0
        if snap.is_active:
            daily_active[day] += 1

    return Response({
        'total_jobs': total_jobs,
        'active_jobs': active_jobs,
        'expired_jobs': expired_jobs,
        'top_hubs': list(top_hubs),
        'top_companies': list(top_companies),
        'top_roles': list(top_roles),
        'daily_active': daily_active,
    })


@api_view(['GET'])
@permission_classes([IsCEOOrManagement])
def ceo_demand_movements(request):
    """CEO Daily Intelligence: demand movements across all role categories."""
    period = int(request.query_params.get('period', 30))
    movements = JobDemandMovement.objects.filter(
        period_days=period
    ).order_by('-period_start')[:50]

    return Response({
        'period_days': period,
        'movements': [
            {
                'role_category': m.role_category,
                'period_start': str(m.period_start),
                'period_end': str(m.period_end),
                'active_jobs_start': m.active_jobs_start,
                'active_jobs_end': m.active_jobs_end,
                'new_postings': m.new_postings,
                'expired_postings': m.expired_postings,
                'net_change': m.net_change,
                'change_percentage': m.change_percentage,
            }
            for m in movements
        ],
    })


@api_view(['GET'])
@permission_classes([IsCEOOrManagement])
def ceo_skill_summary(request):
    """CEO Training Recommendations: high-demand skills for strategic decisions."""
    from django.db.models import Count

    tech_demands = (
        JobClassification.objects
        .exclude(primary_technologies=[])
        .values('primary_technologies')
        .annotate(count=Count('id'))
        .order_by('-count')[:20]
    )

    flat_techs = []
    for entry in tech_demands:
        techs = entry['primary_technologies'] or []
        if isinstance(techs, list):
            for t in techs:
                flat_techs.append({'technology': t, 'count': entry['count']})

    tech_agg = {}
    for item in flat_techs:
        t = item['technology']
        tech_agg[t] = tech_agg.get(t, 0) + item['count']

    sorted_techs = sorted(tech_agg.items(), key=lambda x: x[1], reverse=True)[:15]

    skill_demands = (
        JobClassification.objects
        .exclude(skills=[])
        .values('skills')
        .annotate(count=Count('id'))
        .order_by('-count')[:20]
    )
    flat_skills = []
    for entry in skill_demands:
        skills = entry['skills'] or []
        if isinstance(skills, list):
            for s in skills:
                flat_skills.append({'skill': s, 'count': entry['count']})

    skill_agg = {}
    for item in flat_skills:
        s = item['skill']
        skill_agg[s] = skill_agg.get(s, 0) + item['count']

    sorted_skills = sorted(skill_agg.items(), key=lambda x: x[1], reverse=True)[:15]

    return Response({
        'top_technologies': [{'name': t, 'count': c} for t, c in sorted_techs],
        'top_skills': [{'name': s, 'count': c} for s, c in sorted_skills],
    })


# ---------------------------------------------------------------------------
# Market Analyst - Trend Engine
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsMarketAnalyst])
def demand_trends(request):
    """Trend Engine: 7/30/60/90-day demand growth or decline per role/technology."""
    from django.db.models import Sum

    period = int(request.query_params.get('period', 30))
    group_by = request.query_params.get('group_by', 'role')

    movements = JobDemandMovement.objects.filter(period_days=period)

    if group_by == 'role':
        agg = (
            movements
            .values('role_category')
            .annotate(
                total_new=Sum('new_postings'),
                total_expired=Sum('expired_postings'),
                total_net=Sum('net_change'),
                avg_change_pct=Avg('change_percentage'),
            )
            .order_by('-total_net')
        )
        return Response({
            'period_days': period,
            'group_by': group_by,
            'trends': list(agg),
        })

    return Response({
        'period_days': period,
        'group_by': group_by,
        'trends': [],
    })


@api_view(['GET'])
@permission_classes([IsMarketAnalyst])
def job_traceability(request, job_id):
    """Data Traceability: inspect linked raw source records for a canonical job."""
    from django.shortcuts import get_object_or_404

    canonical = get_object_or_404(CanonicalJob, pk=job_id)
    source_records = JobSourceRecord.objects.filter(
        canonical_job=canonical
    ).select_related('raw_job')

    sources = []
    for sr in source_records:
        raw = sr.raw_job
        sources.append({
            'id': str(sr.id),
            'provider_code': sr.provider_code,
            'external_id': sr.external_id,
            'url': sr.url,
            'dedup_match_type': sr.dedup_match_type,
            'raw_title': raw.title if raw else '',
            'raw_company': raw.company if raw else '',
            'raw_location': raw.location if raw else '',
            'raw_url': raw.url if raw else '',
            'fetched_at': raw.fetched_at.isoformat() if raw and raw.fetched_at else None,
        })

    classification = None
    if hasattr(canonical, 'classification') and canonical.classification:
        c = canonical.classification
        classification = {
            'role_category': c.role_category,
            'primary_technologies': c.primary_technologies,
            'secondary_technologies': c.secondary_technologies,
            'skills': c.skills,
            'confidence_score': c.confidence_score,
            'classification_method': c.classification_method,
        }

    return Response({
        'canonical_job': {
            'id': str(canonical.id),
            'title': canonical.title,
            'company_name_raw': canonical.company_name_raw,
            'location_raw': canonical.location_raw,
            'status': canonical.status,
            'first_seen': canonical.first_seen.isoformat() if canonical.first_seen else None,
            'last_seen': canonical.last_seen.isoformat() if canonical.last_seen else None,
        },
        'source_records': sources,
        'classification': classification,
    })


# ---------------------------------------------------------------------------
# Training Manager - Skill Matrix
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsTrainingManager])
def skill_matrix(request):
    """Technology & Skill Matrices: top skills mapped to role families."""
    from django.db.models import Count

    role_classifications = (
        JobClassification.objects
        .values('role_category')
        .annotate(count=Count('id'))
        .order_by('-count')
    )

    matrix = []
    for rc in role_classifications:
        role = rc['role_category']
        classes = JobClassification.objects.filter(role_category=role)

        tech_agg = {}
        skill_agg = {}
        for cls in classes:
            for t in (cls.primary_technologies or []):
                tech_agg[t] = tech_agg.get(t, 0) + 1
            for s in (cls.skills or []):
                skill_agg[s] = skill_agg.get(s, 0) + 1

        top_techs = sorted(tech_agg.items(), key=lambda x: x[1], reverse=True)[:8]
        top_skills = sorted(skill_agg.items(), key=lambda x: x[1], reverse=True)[:8]

        matrix.append({
            'role_category': role,
            'total_jobs': rc['count'],
            'top_technologies': [{'name': t, 'count': c} for t, c in top_techs],
            'top_skills': [{'name': s, 'count': c} for s, c in top_skills],
        })

    return Response({'matrix': matrix})


@api_view(['GET'])
@permission_classes([IsTrainingManager])
def emerging_skills(request):
    """Emerging Skills: monitor emerging or declining toolsets across experience bands."""
    from django.db.models import Count

    recent_cutoff = dj_timezone.now() - timedelta(days=30)
    older_cutoff = dj_timezone.now() - timedelta(days=90)

    recent_classes = JobClassification.objects.filter(
        canonical_job__last_seen__gte=recent_cutoff
    )
    older_classes = JobClassification.objects.filter(
        canonical_job__last_seen__gte=older_cutoff,
        canonical_job__last_seen__lt=recent_cutoff,
    )

    def agg_skills(classes):
        agg = {}
        for cls in classes:
            for t in (cls.primary_technologies or []):
                agg[t] = agg.get(t, 0) + 1
            for s in (cls.skills or []):
                agg[s] = agg.get(s, 0) + 1
        return agg

    recent_agg = agg_skills(recent_classes)
    older_agg = agg_skills(older_classes)

    all_techs = set(list(recent_agg.keys()) + list(older_agg.keys()))
    trending = []
    for tech in all_techs:
        recent_count = recent_agg.get(tech, 0)
        older_count = older_agg.get(tech, 0)
        if older_count == 0 and recent_count > 0:
            trend = 'emerging'
            change_pct = 100.0
        elif older_count > 0:
            change_pct = ((recent_count - older_count) / older_count) * 100
            trend = 'growing' if change_pct > 10 else ('declining' if change_pct < -10 else 'stable')
        else:
            continue
        trending.append({
            'name': tech,
            'recent_count': recent_count,
            'older_count': older_count,
            'change_percentage': round(change_pct, 1),
            'trend': trend,
        })

    trending.sort(key=lambda x: x['change_percentage'], reverse=True)

    return Response({
        'trending': trending[:30],
        'declining': [t for t in trending if t['trend'] == 'declining'][:10],
        'emerging': [t for t in trending if t['trend'] == 'emerging'][:10],
    })


# ---------------------------------------------------------------------------
# Recruitment Team - Employer Intelligence
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsRecruitmentTeam])
def recurring_hiring(request):
    """Recurring Hiring Detector: companies posting high volumes or repetitive campaigns."""
    from django.db.models import Count

    companies = (
        CanonicalJob.objects
        .exclude(company_name_raw='')
        .filter(status='active')
        .values('company_name_raw')
        .annotate(
            total_postings=Count('id'),
            unique_roles=Count('normalized_title', distinct=True),
        )
        .order_by('-total_postings')[:50]
    )

    high_volume = [
        c for c in companies if c['total_postings'] >= 3
    ]

    return Response({
        'companies': high_volume,
        'total_companies': len(high_volume),
    })


@api_view(['GET'])
@permission_classes([IsRecruitmentTeam])
def employer_scores_view(request):
    """Employer Opportunity Score: companies ranked 0-100."""
    min_score = float(request.query_params.get('min_score', 0))
    max_score = float(request.query_params.get('max_score', 100))

    scores = EmployerHiringScore.objects.select_related('company').filter(
        hiring_score__gte=min_score,
        hiring_score__lte=max_score,
    ).order_by('-hiring_score')[:100]

    return Response({
        'scores': [
            {
                'id': str(s.id),
                'company_name': s.company.name if s.company else '',
                'company_id': str(s.company_id) if s.company_id else '',
                'period_start': str(s.period_start),
                'period_end': str(s.period_end),
                'total_postings': s.total_postings,
                'active_postings': s.active_postings,
                'unique_roles': s.unique_roles,
                'hiring_score': s.hiring_score,
            }
            for s in scores
        ],
    })
