# Sync model with existing DB columns

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_ingestion_pipeline_models'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='ingestionrun',
                    name='celery_task_id',
                    field=models.CharField(blank=True, default='', max_length=255),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='batch_id',
                    field=models.CharField(blank=True, default='', max_length=255),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='classified_count',
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='current_step',
                    field=models.CharField(blank=True, default='', max_length=100),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='duplicate_count',
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='filters',
                    field=models.JSONField(blank=True, default=dict),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='requests_made',
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='retry_of_id',
                    field=models.UUIDField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='skipped_reason',
                    field=models.CharField(blank=True, default='', max_length=500),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='step_logs',
                    field=models.JSONField(blank=True, default=list),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='trigger',
                    field=models.CharField(blank=True, default='manual', max_length=50),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='triggered_by_id',
                    field=models.UUIDField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='unique_count',
                    field=models.PositiveIntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='ingestionrun',
                    name='valid_count',
                    field=models.PositiveIntegerField(default=0),
                ),
            ],
            database_operations=[],
        ),
    ]
