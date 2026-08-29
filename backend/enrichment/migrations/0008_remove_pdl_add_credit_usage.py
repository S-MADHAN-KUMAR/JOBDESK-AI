from django.db import migrations, models


def remove_pdl(apps, schema_editor):
    EnrichmentSource = apps.get_model('enrichment', 'EnrichmentSource')
    EnrichmentSource.objects.filter(provider_code='pdl').delete()


def noop_reverse(apps, schema_editor):
    """People Data Labs connector was removed; no restore path."""


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0007_remove_lusha_enrichment_source'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrichmentsource',
            name='credit_usage',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Latest provider credit balances (email/phone/search/lead/dial).',
            ),
        ),
        migrations.RunPython(remove_pdl, noop_reverse),
        migrations.AlterField(
            model_name='contact',
            name='provider_source',
            field=models.CharField(
                help_text='Source provider (contactout, apollo)',
                max_length=50,
            ),
        ),
    ]
