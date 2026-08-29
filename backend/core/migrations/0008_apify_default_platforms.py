from django.db import migrations


DEFAULT_PLATFORMS = ["LinkedIn", "Indeed", "Naukri.com", "Glassdoor"]


def seed_apify_platforms(apps, schema_editor):
    JobSource = apps.get_model('core', 'JobSource')
    for source in JobSource.objects.filter(provider_code='apify'):
        params = dict(source.default_params or {})
        if not params.get('platforms'):
            params['platforms'] = list(DEFAULT_PLATFORMS)
            source.default_params = params
            source.save(update_fields=['default_params'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_remove_coresignal_job_source'),
    ]

    operations = [
        migrations.RunPython(seed_apify_platforms, noop_reverse),
    ]
