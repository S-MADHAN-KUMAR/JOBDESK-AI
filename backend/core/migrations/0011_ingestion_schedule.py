import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0010_serpapi_default_platforms'),
    ]

    operations = [
        migrations.CreateModel(
            name='IngestionSchedule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('source_id', models.CharField(default='all', max_length=64)),
                ('keyword', models.CharField(blank=True, default='', max_length=255)),
                ('location', models.CharField(blank=True, default='', max_length=255)),
                ('country', models.CharField(blank=True, default='India', max_length=100)),
                ('max_pages', models.PositiveIntegerField(default=5)),
                ('min_salary', models.PositiveIntegerField(default=0)),
                ('max_salary', models.PositiveIntegerField(default=0)),
                ('employment_type', models.CharField(blank=True, default='', max_length=50)),
                ('work_mode', models.CharField(blank=True, default='', max_length=50)),
                ('role', models.CharField(blank=True, default='', max_length=255)),
                ('posted_within', models.CharField(blank=True, default='', max_length=50)),
                ('platforms', models.JSONField(blank=True, default=list)),
                ('apify_platforms', models.JSONField(blank=True, default=list)),
                ('serpapi_platforms', models.JSONField(blank=True, default=list)),
                ('frequency', models.CharField(
                    choices=[
                        ('once', 'One-time'),
                        ('daily', 'Daily'),
                        ('weekly', 'Weekly'),
                        ('monthly', 'Monthly'),
                    ],
                    default='daily',
                    max_length=20,
                )),
                ('time', models.CharField(default='9:00 AM', max_length=20)),
                ('day_of_week', models.PositiveSmallIntegerField(
                    default=1,
                    help_text='JS-style weekday: 0=Sunday .. 6=Saturday',
                )),
                ('day_of_month', models.PositiveSmallIntegerField(default=1)),
                ('start_date', models.DateField(blank=True, null=True)),
                ('total_runs', models.PositiveIntegerField(default=0, help_text='0 means unlimited')),
                ('runs_completed', models.PositiveIntegerField(default=0)),
                ('enabled', models.BooleanField(default=True)),
                ('last_run', models.DateTimeField(blank=True, null=True)),
                ('last_run_status', models.CharField(blank=True, default='', max_length=20)),
                ('last_error', models.TextField(blank=True, default='')),
                ('next_run', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='ingestion_schedules',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='ingestionschedule',
            index=models.Index(fields=['enabled', 'next_run'], name='core_ingest_enabled_f4e98b_idx'),
        ),
    ]
