import logging
from datetime import datetime, timezone

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import F, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .auth import blacklist_jti
from .auth_cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .throttles import enforce_rate_limit
from .models import IngestionRun, JobSource, RawJob
from .permissions import IsAdmin, IsMarketAnalyst
from .providers import ProviderError, get_provider
from .serializers import (
    JobSourceSerializer,
    RawJobSerializer,
    UserAdminSerializer,
    UserProfileSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def _truncate(value: str, max_length: int = 255) -> str:
    """Truncate a string to max_length, appending '...' if trimmed."""
    if not isinstance(value, str):
        value = str(value) if value else ''
    if len(value) > max_length:
        return value[:max_length - 3] + '...'
    return value


from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.permissions import AllowAny


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    cache.set('health_check', 'ok', timeout=30)
    cache_ok = cache.get('health_check') == 'ok'
    return Response({
        'status': 'ok',
        'cache': 'ok' if cache_ok else 'unreachable',
    })


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    FR-001: Admin management of users and role assignments.
    Auditable endpoints restricted strictly to Admin users.
    """
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        user = serializer.save()
        if self.request.data.get('send_invite') and user.email:
            from core.services.email import send_password_link
            send_password_link(user, invite=True)

    @action(detail=True, methods=['post'], url_path='invite')
    def invite(self, request, pk=None):
        user = self.get_object()
        if not user.email:
            return Response(
                {'detail': 'User has no email address.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from core.services.email import send_password_link
        send_password_link(user, invite=True)
        return Response({'detail': f'Invite sent to {user.email}.'})


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)

    def put(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request):
        return self.put(request)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from core.serializers import PasswordChangeSerializer
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['current_password']):
            return Response(
                {'current_password': ['Current password is incorrect.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return Response({'status': 'password updated'})


class JobExplorerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    FR-005: Market Analyst job explorer — browse individual job records with
    search/filter controls and raw-to-normalized source traceability.
    """
    serializer_class = RawJobSerializer
    permission_classes = [IsMarketAnalyst]
    pagination_class = PageNumberPagination

    def get_queryset(self):
        queryset = RawJob.objects.select_related('ingestion_run').order_by('-fetched_at')
        query = self.request.query_params.get('q', '').strip()
        if query:
            queryset = queryset.filter(
                Q(title__icontains=query)
                | Q(company__icontains=query)
                | Q(location__icontains=query)
                | Q(description__icontains=query)
            )
        provider = self.request.query_params.get('provider', '').strip()
        if provider:
            queryset = queryset.filter(provider_code=provider)
        return queryset

    @action(detail=False, methods=['get'], url_path='providers')
    def providers(self, request):
        return Response(
            list(RawJob.objects.values_list('provider_code', flat=True).distinct())
        )

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Bulk-delete raw job records by ID (multi-select cleanup)."""
        ids = request.data.get('ids') or []
        if not ids:
            return Response({
                'success': False,
                'deleted': 0,
                'message': 'No job IDs provided.',
            }, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = RawJob.objects.filter(id__in=ids).delete()
        return Response({
            'success': True,
            'deleted': deleted,
            'message': f'Deleted {deleted} job record(s).',
        }, status=status.HTTP_200_OK)


class JobSourceViewSet(viewsets.ModelViewSet):
    """
    FR-002: Admin management of job-source connectors.
    Full CRUD restricted to Admin users; credentials stay encrypted server-side.
    """
    queryset = JobSource.objects.all().order_by('name')
    serializer_class = JobSourceSerializer
    permission_classes = [IsAdmin]

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        source = self.get_object()
        now = datetime.now(timezone.utc)

        try:
            provider = get_provider(source)
            healthy = provider.health_check()
            credits = provider.persist_credit_usage()
            headroom = max(0, source.rate_limit_daily - source.current_daily_uses)
        except ProviderError as exc:
            source.health_status = JobSource.HealthStatus.FAILED
            source.save(update_fields=['health_status', 'last_run_at'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': str(exc),
                'checked_at': now.isoformat(),
            }, status=status.HTTP_200_OK)

        if not healthy:
            source.health_status = JobSource.HealthStatus.FAILED
            source.save(update_fields=['health_status', 'last_run_at'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': f'Connection failed for {source.name}. Check the API key and try again.',
                'checked_at': now.isoformat(),
            }, status=status.HTTP_200_OK)

        source.health_status = JobSource.HealthStatus.HEALTHY
        source.last_run_at = now
        source.save(update_fields=['health_status', 'last_run_at'])
        source.refresh_from_db(fields=['credit_usage'])
        return Response({
            'success': True,
            'provider': source.provider_code,
            'status': source.health_status,
            'message': f'Connection OK for {source.name}. API responded successfully.',
            'rate_limit_headroom': headroom,
            'credit_usage': credits or source.credit_usage,
            'checked_at': now.isoformat(),
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='refresh-credits')
    def refresh_credits(self, request, pk=None):
        """Pull live remaining credits from SerpAPI Account API or Apify limits."""
        source = self.get_object()
        if not source.has_auth_config():
            return Response({
                'success': False,
                'message': 'API credentials are not configured.',
                'credit_usage': source.credit_usage or {},
            }, status=status.HTTP_200_OK)
        try:
            provider = get_provider(source)
            credits = provider.persist_credit_usage()
        except ProviderError as exc:
            return Response({
                'success': False,
                'message': str(exc),
                'credit_usage': source.credit_usage or {},
            }, status=status.HTTP_200_OK)
        return Response({
            'success': True,
            'provider': source.provider_code,
            'credit_usage': credits,
            'message': 'Credits refreshed.',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='run-ingestion')
    def run_ingestion(self, request, pk=None):
        """
        FR-003/FR-004: Run a manual ingestion for this provider.
        Creates an IngestionRun, fetches jobs via the provider, and stores
        the original payloads in the RawJob table.
        """
        source = self.get_object()
        now = datetime.now(timezone.utc)

        if not source.is_active:
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': f'{source.name} is disabled. Enable it before running an ingestion.',
            }, status=status.HTTP_200_OK)

        if not source.has_auth_config():
            source.health_status = JobSource.HealthStatus.FAILED
            source.save(update_fields=['health_status'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': 'API credentials are not configured. Add credentials and try again.',
            }, status=status.HTTP_200_OK)

        keyword = str(request.data.get('keyword', '')).strip() or source.default_params.get('keyword', '')
        location = str(request.data.get('location', '')).strip() or source.default_params.get('location', '')
        country = str(request.data.get('country', '')).strip() or source.default_params.get('country', '')
        try:
            max_pages = max(1, int(request.data.get('max_pages') or source.default_params.get('max_pages') or 1))
        except (TypeError, ValueError):
            max_pages = 1
        try:
            min_salary = int(request.data.get('min_salary') or source.default_params.get('min_salary') or 0)
        except (TypeError, ValueError):
            min_salary = 0
        try:
            max_salary = int(request.data.get('max_salary') or source.default_params.get('max_salary') or 0)
        except (TypeError, ValueError):
            max_salary = 0
        employment_type = str(request.data.get('employment_type', '')).strip() or source.default_params.get('employment_type', '')
        work_mode = str(request.data.get('work_mode', '')).strip() or source.default_params.get('work_mode', '')
        role = str(request.data.get('role', '')).strip() or source.default_params.get('role', '')
        posted_within = str(request.data.get('posted_within', '')).strip() or source.default_params.get('posted_within', '')
        platforms = request.data.get('platforms')
        if platforms is None:
            platforms = source.default_params.get('platforms')

        run = IngestionRun.objects.create(
            provider=source,
            status=IngestionRun.Status.RUNNING,
            started_at=now,
        )

        errors = []
        fetched = 0
        try:
            provider = get_provider(source)
            filters = {
                'keyword': keyword,
                'location': location,
                'country': country,
                'max_pages': max_pages,
                'min_salary': min_salary,
                'max_salary': max_salary,
                'employment_type': employment_type,
                'work_mode': work_mode,
                'role': role,
                'posted_within': posted_within,
            }
            if platforms is not None:
                filters['platforms'] = platforms
            # Cap to Source Management Max results (same rule as Celery tasks).
            from core.tasks import _apply_source_result_cap
            filters = _apply_source_result_cap(source, filters)
            raw_records = provider.search_jobs(filters)
            cap = int(filters.get('max_results') or max_pages or 1)
            if len(raw_records) > cap:
                raw_records = raw_records[:cap]

            for record in raw_records:
                try:
                    normalized = provider.normalize_source_record(record)
                    RawJob.objects.create(
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
                except Exception as exc:
                    errors.append({'error': str(exc)})

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
            try:
                provider.persist_credit_usage()
            except Exception:  # noqa: BLE001
                pass
            source.refresh_from_db(fields=['credit_usage'])
            return Response({
                'success': run.status in (
                    IngestionRun.Status.COMPLETED,
                    IngestionRun.Status.PARTIAL,
                ),
                'provider': source.provider_code,
                'status': run.status,
                'message': (
                    f'Ingestion {run.status}: {fetched} jobs stored, '
                    f'{len(errors)} error(s).'
                ),
                'run_id': str(run.id),
                'fetched_count': fetched,
                'error_count': len(errors),
                'errors': errors[:5],
                'credit_usage': source.credit_usage or {},
                'started_at': run.started_at.isoformat(),
                'ended_at': run.ended_at.isoformat(),
            }, status=status.HTTP_200_OK)
        except ProviderError as exc:
            run.status = IngestionRun.Status.FAILED
            run.ended_at = datetime.now(timezone.utc)
            run.error_logs = [{'error': str(exc)}]
            run.save()
            source.health_status = JobSource.HealthStatus.FAILED
            source.last_run_at = now
            source.save(update_fields=['health_status', 'last_run_at'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': run.status,
                'message': str(exc),
                'run_id': str(run.id),
                'fetched_count': 0,
                'error_count': 1,
                'errors': [{'error': str(exc)}],
                'started_at': run.started_at.isoformat(),
                'ended_at': run.ended_at.isoformat(),
            }, status=status.HTTP_200_OK)


class CookieTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        enforce_rate_limit(request, 'login', 8, 15 * 60)
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_auth_cookies(response, response.data['access'], response.data['refresh'])
            response.data = {'detail': 'ok'}
        return response


class CookieTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        enforce_rate_limit(request, 'refresh', 30, 15 * 60)
        refresh = request.COOKIES.get(REFRESH_COOKIE) or request.data.get('refresh')
        if not refresh:
            return Response({'detail': 'No refresh token.'}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data={'refresh': refresh})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        response = Response({'detail': 'ok'})
        set_auth_cookies(response, data['access'], data.get('refresh'))
        return response


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        enforce_rate_limit(request, 'forgot-password', 5, 15 * 60)
        email = (request.data.get('email') or '').strip()
        if email:
            user = User.objects.filter(email__iexact=email, is_active=True).first()
            if user:
                from core.services.email import send_password_link
                try:
                    send_password_link(user, invite=False)
                except Exception as exc:
                    logger.exception('Forgot-password email failed for user_id=%s: %s', user.pk, exc)
                    payload = {
                        'detail': (
                            'Could not send reset email. Check Resend API key, '
                            'from-address/domain, daily quota, and that the '
                            'recipient is allowed on your Resend plan.'
                        ),
                    }
                    from django.conf import settings as dj_settings
                    if dj_settings.DEBUG:
                        payload['error'] = str(exc)
                    return Response(payload, status=status.HTTP_502_BAD_GATEWAY)
            else:
                logger.info('Forgot-password: no active user for email=%s', email)
        return Response({'detail': 'If that email exists, a reset link was sent.'})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        enforce_rate_limit(request, 'reset-password', 8, 15 * 60)
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_decode

        uid = request.data.get('uid') or ''
        token = request.data.get('token') or ''
        password = request.data.get('password') or ''
        if len(password) < 8:
            return Response(
                {'password': ['Password must be at least 8 characters.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_id = urlsafe_base64_decode(uid).decode()
            user = User.objects.get(pk=user_id)
        except Exception:
            return Response({'detail': 'Invalid reset link.'}, status=status.HTTP_400_BAD_REQUEST)
        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'Reset link is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'detail': 'Password updated. You can sign in now.'})


class LogoutView(APIView):
    """Blacklists tokens when present and always clears auth cookies."""

    permission_classes = [AllowAny]

    def post(self, request):
        now = datetime.now(timezone.utc)
        try:
            if request.auth:
                access = request.auth if isinstance(request.auth, AccessToken) else AccessToken(str(request.auth))
                ttl = int(access['exp']) - int(now.timestamp())
                if ttl > 0:
                    blacklist_jti(access['jti'], ttl)
        except Exception:
            pass

        refresh_token = request.data.get('refresh') or request.COOKIES.get(REFRESH_COOKIE)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except Exception:
                pass

        response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        return clear_auth_cookies(response)