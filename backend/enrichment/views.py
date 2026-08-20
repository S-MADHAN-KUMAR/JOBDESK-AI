from datetime import datetime, timezone
import logging

from django.db.models import F, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdmin, IsMarketAnalyst
from enrichment.providers import ProviderError, get_enrichment_provider
from enrichment.services.manager import ContactProvenanceManager
from enrichment.services.waterfall import EnrichmentWaterfallOrchestrator

from .models import Company, Contact, EnrichmentRun, EnrichmentSource
from .serializers import (
    CompanySerializer,
    ContactSerializer,
    EnrichmentSourceSerializer,
)

logger = logging.getLogger(__name__)


class EnrichmentSourceViewSet(viewsets.ModelViewSet):
    """SRS Section 7: Admin management of contact-enrichment connectors.
    Admins can enable/disable providers, store credentials, and test them."""

    queryset = EnrichmentSource.objects.all().order_by('name')
    serializer_class = EnrichmentSourceSerializer
    permission_classes = [IsAdmin]

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        source = self.get_object()
        now = datetime.now(timezone.utc)

        if not source.has_auth_config():
            source.health_status = EnrichmentSource.HealthStatus.FAILED
            source.save(update_fields=['health_status'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': 'API credentials are not configured. Add credentials and try again.',
            }, status=status.HTTP_200_OK)

        try:
            provider = get_enrichment_provider(source)
            ok = provider.health_check()
        except ProviderError as exc:
            source.health_status = EnrichmentSource.HealthStatus.FAILED
            source.save(update_fields=['health_status'])
            return Response({
                'success': False,
                'provider': source.provider_code,
                'status': source.health_status,
                'message': str(exc),
            }, status=status.HTTP_200_OK)

        source.health_status = (
            EnrichmentSource.HealthStatus.HEALTHY if ok
            else EnrichmentSource.HealthStatus.FAILED
        )
        source.last_run_at = now
        source.save(update_fields=['health_status', 'last_run_at'])
        return Response({
            'success': ok,
            'provider': source.provider_code,
            'status': source.health_status,
            'message': (
                f'Connection OK for {source.name}. API responded successfully.'
                if ok
                else f'Connection failed for {source.name}. Check the API key.'
            ),
            'checked_at': now.isoformat(),
        }, status=status.HTTP_200_OK)


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    """Market Analyst: browse companies targeted for enrichment."""

    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsMarketAnalyst]

    def get_queryset(self):
        queryset = Company.objects.all()
        search = self.request.query_params.get('q', '').strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(domain__icontains=search))
        return queryset


class ContactViewSet(viewsets.ReadOnlyModelViewSet):
    """FR-022: Market Analyst browse of enriched contacts with provenance."""

    serializer_class = ContactSerializer
    permission_classes = [IsMarketAnalyst]
    pagination_class = PageNumberPagination

    def get_queryset(self):
        queryset = Contact.objects.select_related('company').order_by('-created_at')
        company = self.request.query_params.get('company', '').strip()
        if company:
            queryset = queryset.filter(company_id=company)
        provider = self.request.query_params.get('provider', '').strip()
        if provider:
            queryset = queryset.filter(provider_source=provider)
        verification = self.request.query_params.get('verification', '').strip()
        if verification:
            queryset = queryset.filter(verification_state=verification)
        return queryset

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        """Bulk-delete enriched contact records by ID (multi-select cleanup)."""
        ids = request.data.get('ids') or []
        if not ids:
            return Response({
                'success': False,
                'deleted': 0,
                'message': 'No contact IDs provided.',
            }, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = Contact.objects.filter(id__in=ids).delete()
        return Response({
            'success': True,
            'deleted': deleted,
            'message': f'Deleted {deleted} contact record(s).',
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='enrich-phone')
    def enrich_phone(self, request, pk=None):
        """Per-contact phone enrichment: request + poll Apollo for one person.

        Runs Apollo's people/match with phone reveal for this specific person.
        If Apollo hasn't produced the number yet, the request is queued on the
        company's latest run so the global phone poll can backfill it later.
        """
        contact = self.get_object()
        source = EnrichmentSource.objects.filter(
            provider_code='apollo', is_active=True,
        ).first()
        if source is None or not source.has_auth_config():
            return Response({
                'success': False,
                'phone': '',
                'pending': False,
                'message': 'Apollo is not configured or has no API key.',
            }, status=status.HTTP_200_OK)

        try:
            provider = get_enrichment_provider(source)
        except ProviderError as exc:
            return Response({
                'success': False,
                'phone': '',
                'pending': False,
                'message': str(exc),
            }, status=status.HTTP_200_OK)

        if not provider._webhook_url():
            return Response({
                'success': False,
                'phone': '',
                'pending': False,
                'message': (
                    'Apollo phone reveal needs a webhook URL. Set it in '
                    'Enrichment Sources > Apollo > Apollo phone webhook URL.'
                ),
            }, status=status.HTTP_200_OK)

        raw = contact.raw_payload or {}
        person_id = raw.get('apollo_person_id') or raw.get('id')
        if not person_id:
            return Response({
                'success': False,
                'phone': '',
                'pending': False,
                'message': 'No Apollo person reference available for this contact.',
            }, status=status.HTTP_200_OK)

        try:
            enriched = provider.enrich_person({'id': person_id})
        except ProviderError as exc:
            return Response({
                'success': False,
                'phone': '',
                'pending': False,
                'message': str(exc),
            }, status=status.HTTP_200_OK)

        phone = enriched.get('phone') or ''
        pending_request = enriched.get('apollo_request_id')
        if phone:
            contact.phone = phone
            contact.save(update_fields=['phone', 'raw_payload'])

        pending = pending_request is not None and not phone
        if pending_request is not None:
            run = EnrichmentRun.objects.filter(
                company=contact.company,
            ).order_by('-started_at').first()
            if run:
                items = list(run.pending_phone_requests or [])
                items.append({
                    'request_id': pending_request,
                    'person_id': person_id,
                    'contact_id': str(contact.id),
                })
                run.pending_phone_requests = items
                run.save(update_fields=['pending_phone_requests'])

        if phone:
            message = f'Phone number found: {phone}'
        elif pending:
            message = (
                'Phone requested; Apollo takes a few minutes to deliver it. '
                'Use Refresh phones shortly to pull it in.'
            )
        else:
            message = 'Apollo returned no phone number for this person.'

        return Response({
            'success': True,
            'phone': phone,
            'pending': pending,
            'message': message,
        }, status=status.HTTP_200_OK)


class EnrichmentRunView(APIView):
    """FR-022: Waterfall contact enrichment for a target company.
    PDL -> ContactOut -> Apollo; stops once a verified email + LinkedIn
    contact is found. Contacts are stored with full provenance."""

    permission_classes = [IsMarketAnalyst]

    def post(self, request):
        company_name = str(request.data.get('company_name', '')).strip()
        titles_raw = request.data.get('titles') or []
        if isinstance(titles_raw, str):
            titles = [t.strip() for t in titles_raw.replace(',', '\n').split('\n') if t.strip()]
        else:
            titles = [str(t).strip() for t in titles_raw if str(t).strip()]
        location = str(request.data.get('location', '')).strip() or None

        if not company_name:
            return Response({
                'success': False,
                'message': 'A target company name is required.',
            }, status=status.HTTP_400_BAD_REQUEST)
        if not titles:
            titles = ['Recruiter', 'Talent Acquisition', 'HR']

        sources = EnrichmentSource.objects.filter(is_active=True)
        orchestrator = EnrichmentWaterfallOrchestrator(sources)
        contacts, used, call_logs = orchestrator.enrich_company_contacts(company_name, titles, location)

        company, _ = Company.objects.get_or_create(
            name=company_name,
            defaults={'location': location or ''},
        )
        run = EnrichmentRun.objects.create(
            company=company,
            providers_used=used,
            call_logs=call_logs,
            contacts_found=len(contacts),
        )

        manager = ContactProvenanceManager()
        stored = 0
        errors = []
        pending_phones: list = []
        for contact in contacts:
            try:
                saved = manager.save_enriched_contact(company, contact)
                stored += 1
                request_id = contact.get("apollo_request_id")
                if request_id is not None:
                    pending_phones.append({
                        "request_id": request_id,
                        "person_id": contact.get("apollo_person_id", ""),
                        "contact_id": str(saved.id),
                    })
            except Exception as exc:  # noqa: BLE001 - keep per-record failures auditable
                errors.append({'error': str(exc)})

        run.stored_count = stored
        run.error_count = len(errors)
        run.error_logs = errors
        run.pending_phone_requests = pending_phones
        run.status = (
            EnrichmentRun.Status.COMPLETED if not errors
            else EnrichmentRun.Status.PARTIAL
        )
        run.ended_at = datetime.now(timezone.utc)
        run.save()

        if used:
            EnrichmentSource.objects.filter(provider_code__in=used).update(
                current_daily_uses=F('current_daily_uses') + 1,
                last_run_at=datetime.now(timezone.utc),
            )

        logger.info(
            "Enrichment run %s COMPLETED for %s: %s contact(s) found, %s stored, "
            "%s error(s), providers used: %s",
            run.id,
            company.name,
            len(contacts),
            stored,
            len(errors),
            ", ".join(used) if used else "none",
        )

        return Response({
            'success': run.status == EnrichmentRun.Status.COMPLETED,
            'message': (
                f'Enrichment {run.status}: {stored} contact(s) stored from '
                f'{", ".join(used) if used else "no active providers"}.'
            ),
            'run_id': str(run.id),
            'contacts_found': len(contacts),
            'stored': stored,
            'error_count': len(errors),
            'errors': errors[:5],
            'providers_used': used,
            'call_logs': call_logs,
            'pending_phones': len(pending_phones),
        }, status=status.HTTP_200_OK)


class PhonePollView(APIView):
    """FR-022: Backfill phone numbers for pending Apollo reveal requests.

    Apollo delivers phone numbers asynchronously. This endpoint polls the
    webhook-result store for every pending request across recent runs and
    updates the stored contacts. Safe to call repeatedly."""
    permission_classes = [IsMarketAnalyst]

    def post(self, request):
        source = EnrichmentSource.objects.filter(
            provider_code='apollo', is_active=True,
        ).first()
        if source is None or not source.has_auth_config():
            return Response({
                'success': False,
                'updated': 0,
                'pending': 0,
                'message': 'Apollo is not configured or has no API key.',
            }, status=status.HTTP_200_OK)
        try:
            provider = get_enrichment_provider(source)
        except ProviderError as exc:
            return Response({
                'success': False,
                'updated': 0,
                'pending': 0,
                'message': str(exc),
            }, status=status.HTTP_200_OK)

        pending = [
            run for run in EnrichmentRun.objects.order_by('-started_at')[:50]
            if run.pending_phone_requests
        ]

        updated = 0
        pending_count = 0
        for run in pending:
            items = run.pending_phone_requests or []
            if not items:
                continue
            remaining = []
            for item in items:
                request_id = item.get('request_id')
                contact_id = item.get('contact_id')
                if request_id is None or not contact_id:
                    continue
                try:
                    phone = provider.fetch_phone_by_request_id(request_id)
                except ProviderError:
                    phone = ""
                if phone:
                    Contact.objects.filter(id=contact_id).update(phone=phone)
                    updated += 1
                else:
                    pending_count += 1
                    remaining.append(item)
            run.pending_phone_requests = remaining
            run.save(update_fields=['pending_phone_requests'])

        return Response({
            'success': True,
            'updated': updated,
            'pending': pending_count,
            'message': (
                f'Fetched phone numbers for {updated} contact(s); '
                f'{pending_count} still pending.'
            ),
        }, status=status.HTTP_200_OK)


class ApolloPhoneWebhookView(APIView):
    """Apollo phone-reveal webhook receiver.

    Apollo POSTs revealed phone numbers here asynchronously
    (https://your-public-domain.com/api/enrichment/apollo-webhook/).
    Matches the delivered payload against pending requests and updates the
    stored contacts. Returns immediately; polling is the safety net.
    """
    permission_classes = []  # noqa: DJ008 - unauthenticated provider callback

    def post(self, request):
        payload = request.data or {}
        result = payload.get('webhook_result') or {}
        people = result.get('people') or []
        updated = 0
        for entry in people:
            if not isinstance(entry, dict):
                continue
            person_id = entry.get('id')
            numbers = entry.get('phone_numbers') or []
            phone = ""
            for number in numbers:
                if isinstance(number, dict) and number.get('raw_number'):
                    phone = number['raw_number']
                    break
            if not person_id or not phone:
                continue
            runs = EnrichmentRun.objects.filter(
                pending_phone_requests__len__gt=0,
            ).order_by('-started_at')[:50]
            for run in runs:
                items = run.pending_phone_requests or []
                remaining = []
                matched = False
                for item in items:
                    if item.get('person_id') == person_id:
                        Contact.objects.filter(
                            id=item.get('contact_id'),
                        ).update(phone=phone)
                        updated += 1
                        matched = True
                    else:
                        remaining.append(item)
                if matched:
                    run.pending_phone_requests = remaining
                    run.save(update_fields=['pending_phone_requests'])
        logger.info("Apollo phone webhook received: %s contact(s) updated", updated)
        return Response({'success': True, 'updated': updated}, status=status.HTTP_200_OK)