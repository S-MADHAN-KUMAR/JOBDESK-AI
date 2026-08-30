from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_market_alert'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobsource',
            name='daily_uses_on',
            field=models.DateField(
                blank=True,
                help_text='Local calendar date that current_daily_uses applies to.',
                null=True,
            ),
        ),
    ]
