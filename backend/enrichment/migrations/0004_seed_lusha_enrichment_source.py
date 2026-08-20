from django.db import migrations


def seed_lusha_source(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.update_or_create(
        provider_code='lusha',
        defaults={
            'name': 'Lusha',
            'base_url': 'https://api.lusha.com/v3',
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


def unseed_lusha_source(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(provider_code='lusha').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0003_enrichmentrun_call_logs'),
    ]

    operations = [
        migrations.RunPython(seed_lusha_source, unseed_lusha_source),
    ]