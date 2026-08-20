"""Backfill Apollo phone numbers for pending enrichment runs.

Apollo delivers revealed phone numbers asynchronously. Run this command
periodically (cron) or after an enrichment run to poll the webhook-result
store and update stored contacts with phone numbers.

Usage:
    python manage.py poll_apollo_phones
"""

from django.core.management.base import BaseCommand

from enrichment.models import Contact, EnrichmentRun, EnrichmentSource
from enrichment.providers import ProviderError, get_enrichment_provider


class Command(BaseCommand):
    help = "Poll Apollo for pending phone numbers and update stored contacts."

    def handle(self, *args, **options):
        source = EnrichmentSource.objects.filter(
            provider_code='apollo', is_active=True,
        ).first()
        if source is None or not source.has_auth_config():
            self.stdout.write(self.style.WARNING(
                "Apollo is not configured or has no API key; nothing to do."
            ))
            return
        provider = get_enrichment_provider(source)

        runs = [
            run for run in EnrichmentRun.objects.order_by('-started_at')[:200]
            if run.pending_phone_requests
        ]
        updated = 0
        pending = 0
        for run in runs:
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
                    pending += 1
                    remaining.append(item)
            run.pending_phone_requests = remaining
            run.save(update_fields=['pending_phone_requests'])

        self.stdout.write(self.style.SUCCESS(
            f"Updated {updated} contact(s) with phone numbers; "
            f"{pending} request(s) still pending."
        ))