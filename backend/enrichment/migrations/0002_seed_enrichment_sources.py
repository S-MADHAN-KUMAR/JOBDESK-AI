from django.db import migrations


def seed_enrichment_sources(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.update_or_create(
        provider_code='pdl',
        defaults={
            'name': 'People Data Labs',
            'base_url': 'https://api.peopledatalabs.com/v5',
            'default_params': {
                'max_results': 25,
                'titles': 'Recruiter, Talent Acquisition, HR',
            },
            'rate_limit_rpm': 30,
            'rate_limit_daily': 500,
            'health_status': 'healthy',
            'is_active': True,
        },
    )
    EnrichmentSource.objects.update_or_create(
        provider_code='contactout',
        defaults={
            'name': 'ContactOut',
            'base_url': 'https://api.contactout.com/v1',
            'default_params': {
                'max_results': 25,
                'titles': 'Recruiter, Talent Acquisition, HR',
            },
            'rate_limit_rpm': 30,
            'rate_limit_daily': 500,
            'health_status': 'healthy',
            'is_active': True,
        },
    )
    EnrichmentSource.objects.update_or_create(
        provider_code='apollo',
        defaults={
            'name': 'Apollo',
            'base_url': 'https://api.apollo.io/v1',
            'default_params': {
                'max_results': 25,
                'titles': 'Recruiter, Talent Acquisition, HR',
            },
            'rate_limit_rpm': 30,
            'rate_limit_daily': 500,
            'health_status': 'healthy',
            'is_active': True,
        },
    )


def unseed_enrichment_sources(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(
        provider_code__in=['pdl', 'contactout', 'apollo']
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_enrichment_sources, unseed_enrichment_sources),
    ]