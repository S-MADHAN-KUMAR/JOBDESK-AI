from django.db import migrations, models


def remove_lusha(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(provider_code='lusha').delete()


def noop_reverse(apps, schema_editor):
    """Lusha connector was removed; no restore path."""


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0006_add_pending_phone_requests'),
    ]

    operations = [
        migrations.RunPython(remove_lusha, noop_reverse),
        migrations.AlterField(
            model_name='contact',
            name='provider_source',
            field=models.CharField(
                help_text='Source provider (pdl, contactout, apollo)',
                max_length=50,
            ),
        ),
    ]
