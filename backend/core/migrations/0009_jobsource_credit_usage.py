from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_apify_default_platforms'),
    ]

    operations = [
        migrations.AddField(
            model_name='jobsource',
            name='credit_usage',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Latest provider credit balances (searches/USD/compute units).',
            ),
        ),
    ]
