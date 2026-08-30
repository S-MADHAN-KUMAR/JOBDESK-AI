import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0011_ingestion_schedule'),
    ]

    operations = [
        migrations.CreateModel(
            name='MarketAlert',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('fingerprint', models.CharField(db_index=True, max_length=120, unique=True)),
                ('severity', models.CharField(choices=[('high', 'High'), ('medium', 'Medium'), ('low', 'Low')], max_length=16)),
                ('category', models.CharField(max_length=64)),
                ('title', models.CharField(max_length=255)),
                ('message', models.TextField()),
                ('role_category', models.CharField(blank=True, default='', max_length=255)),
                ('company_id', models.CharField(blank=True, default='', max_length=64)),
                ('company_name', models.CharField(blank=True, default='', max_length=255)),
                ('provider', models.CharField(blank=True, default='', max_length=64)),
                ('metric', models.FloatField(blank=True, null=True)),
                ('dismissed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('dismissed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='dismissed_alerts',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
