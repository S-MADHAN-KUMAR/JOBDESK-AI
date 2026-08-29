from django.db import migrations

DEFAULT_SERPAPI_PLATFORMS = [
    'LinkedIn',
    'Indeed',
    'Naukri',
    'Glassdoor',
]


def seed_serpapi_platforms(apps, schema_editor):
    JobSource = apps.get_model('core', 'JobSource')
    for source in JobSource.objects.filter(provider_code='serpapi'):
        params = dict(source.default_params or {})
        if not params.get('platforms'):
            params['platforms'] = list(DEFAULT_SERPAPI_PLATFORMS)
            source.default_params = params
            source.save(update_fields=['default_params'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_jobsource_credit_usage'),
    ]

    operations = [
        migrations.RunPython(seed_serpapi_platforms, noop_reverse),
    ]
