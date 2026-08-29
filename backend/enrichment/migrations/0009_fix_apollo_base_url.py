from django.db import migrations

OLD_BASE_URL = 'https://api.apollo.io/v1'
NEW_BASE_URL = 'https://api.apollo.io/api/v1'


def fix_apollo_base_url(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(
        provider_code='apollo',
        base_url=OLD_BASE_URL,
    ).update(base_url=NEW_BASE_URL)


def revert_apollo_base_url(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(
        provider_code='apollo',
        base_url=NEW_BASE_URL,
    ).update(base_url=OLD_BASE_URL)


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0008_remove_pdl_add_credit_usage'),
    ]

    operations = [
        migrations.RunPython(fix_apollo_base_url, revert_apollo_base_url),
    ]
