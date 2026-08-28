import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("demandaccel")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


def parse_12h_time(time_str: str) -> tuple[int, int]:
    """Parse 12-hour time string (e.g. '1:00 AM', '2:30 PM') to 24h hour, minute."""
    time_str = time_str.strip().upper()
    parts = time_str.replace(".", "").split()
    time_part = parts[0]
    period = parts[1] if len(parts) > 1 else None

    hour_str, minute_str = time_part.split(":")
    hour = int(hour_str)
    minute = int(minute_str)

    if period == "AM":
        if hour == 12:
            hour = 0
    elif period == "PM":
        if hour != 12:
            hour += 12

    return hour, minute


# Beat schedule for ingestion pipeline
# INGESTION_SCHEDULE_TIME accepts 12-hour format, e.g. "1:00 AM", "2:30 PM"
_schedule_time = os.environ.get("INGESTION_SCHEDULE_TIME", "1:00 AM")
_ingestion_hour, _ingestion_minute = parse_12h_time(_schedule_time)

app.conf.beat_schedule = {
    "run-ingestion-pipeline": {
        "task": "core.tasks.run_scheduled_ingestion",
        "schedule": crontab(hour=_ingestion_hour, minute=_ingestion_minute),
    },
    "aggregate-daily-snapshots": {
        "task": "core.tasks.aggregate_daily_snapshots",
        "schedule": crontab(hour=2, minute=30),
    },
    "compute-demand-movements": {
        "task": "core.tasks.compute_demand_movements",
        "schedule": crontab(hour=3, minute=0),
    },
}
