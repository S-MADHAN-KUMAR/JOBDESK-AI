from django.db import migrations


def remove_coresignal(apps, schema_editor):
    JobSource = apps.get_model('core', 'JobSource')
    JobSource.objects.filter(provider_code='coresignal').delete()


def noop_reverse(apps, schema_editor):
    """Coresignal connector was removed; no restore path."""


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_ingestionrun_sync_db_columns'),
    ]

    operations = [
        migrations.RunPython(remove_coresignal, noop_reverse),
    ]
