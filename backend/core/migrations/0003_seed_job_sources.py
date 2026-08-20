from django.db import migrations


def seed_job_sources(apps, schema_editor):
    JobSource = apps.get_model('core', 'JobSource')
    JobSource.objects.update_or_create(
        provider_code='serpapi',
        defaults={
            'name': 'SerpApi Jobs',
            'base_url': 'https://serpapi.com/search.json',
            'default_params': {
                'keyword': 'Java Backend Developer',
                'location': 'Chennai',
                'max_pages': 5,
            },
            'rate_limit_rpm': 60,
            'rate_limit_daily': 1000,
            'health_status': 'healthy',
            'is_active': True,
        },
    )
    JobSource.objects.update_or_create(
        provider_code='apify',
        defaults={
            'name': 'Apify Connector',
            'base_url': 'https://api.apify.com/v2/acts',
            'default_params': {
                'keyword': 'Software Engineer',
                'location': 'Chennai',
                'country': 'India',
                'max_pages': 3,
            },
            'rate_limit_rpm': 30,
            'rate_limit_daily': 1000,
            'health_status': 'degraded',
            'is_active': False,
        },
    )
    JobSource.objects.update_or_create(
        provider_code='coresignal',
        defaults={
            'name': 'Coresignal Datasets',
            'base_url': 'https://api.coresignal.com/cdapi',
            'default_params': {
                'keyword': 'Backend Engineer',
                'location': 'India',
                'max_pages': 2,
            },
            'rate_limit_rpm': 20,
            'rate_limit_daily': 500,
            'health_status': 'healthy',
            'is_active': True,
        },
    )


def unseed_job_sources(apps, schema_editor):
    JobSource = apps.get_model('core', 'JobSource')
    JobSource.objects.filter(provider_code__in=['serpapi', 'apify', 'coresignal']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_jobsource'),
    ]

    operations = [
        migrations.RunPython(seed_job_sources, unseed_job_sources),
    ]
