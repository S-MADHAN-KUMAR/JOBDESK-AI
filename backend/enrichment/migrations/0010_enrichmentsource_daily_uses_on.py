from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrichment', '0009_fix_apollo_base_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrichmentsource',
            name='daily_uses_on',
            field=models.DateField(
                blank=True,
                help_text='Local calendar date that current_daily_uses applies to.',
                null=True,
            ),
        ),
    ]
