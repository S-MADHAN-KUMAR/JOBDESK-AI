"""Server-side next-run calculation for ingestion schedules."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.utils import timezone as dj_timezone


def parse_12h_time(time_str: str) -> tuple[int, int]:
    """Parse '9:00 AM' / '2:30 PM' into 24h hour, minute."""
    raw = (time_str or "9:00 AM").strip().upper()
    parts = raw.replace(".", "").split()
    time_part = parts[0]
    period = parts[1] if len(parts) > 1 else None
    try:
        hour_str, minute_str = time_part.split(":")
        hour = int(hour_str)
        minute = int(minute_str)
    except (ValueError, AttributeError):
        return 9, 0

    if period == "AM":
        if hour == 12:
            hour = 0
    elif period == "PM":
        if hour != 12:
            hour += 12
    return hour, minute


def _aware(dt: datetime) -> datetime:
    if dj_timezone.is_naive(dt):
        return dj_timezone.make_aware(dt, dj_timezone.get_current_timezone())
    return dt


def calculate_next_run(
    *,
    frequency: str,
    time_str: str,
    day_of_week: int = 1,
    day_of_month: int = 1,
    start_date: date | None = None,
    after: datetime | None = None,
) -> datetime:
    """
    Compute the next fire time for a schedule.

    `after` defaults to now. For recurring schedules after a successful fire,
    pass the previous next_run (or now) so we advance to the following slot.
    """
    now = after or dj_timezone.now()
    if dj_timezone.is_naive(now):
        now = _aware(now)

    hour, minute = parse_12h_time(time_str)
    tz = dj_timezone.get_current_timezone()

    if frequency == "once":
        base = start_date or now.date()
        candidate = _aware(datetime.combine(base, time(hour=hour, minute=minute)))
        if candidate <= now:
            return now + timedelta(minutes=1)
        return candidate

    local_now = dj_timezone.localtime(now, tz)
    candidate = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if frequency == "daily":
        if candidate <= local_now:
            candidate = candidate + timedelta(days=1)
        return candidate

    if frequency == "weekly":
        current_day = local_now.weekday()  # Mon=0..Sun=6
        # Frontend uses JS getDay(): Sun=0..Sat=6
        target = int(day_of_week) % 7
        js_current = (current_day + 1) % 7  # convert Mon=0 -> Sun=0 style
        days_until = target - js_current
        if days_until < 0:
            days_until += 7
        if days_until == 0 and candidate <= local_now:
            days_until = 7
        candidate = candidate + timedelta(days=days_until)
        return candidate

    if frequency == "monthly":
        day = max(1, min(31, int(day_of_month or 1)))
        year, month = local_now.year, local_now.month

        def _safe(y: int, m: int, d: int) -> datetime:
            # Clamp day into month length
            for try_day in range(d, 0, -1):
                try:
                    return _aware(datetime(y, m, try_day, hour, minute))
                except ValueError:
                    continue
            return _aware(datetime(y, m, 1, hour, minute))

        candidate = _safe(year, month, day)
        if candidate <= local_now:
            if month == 12:
                year, month = year + 1, 1
            else:
                month += 1
            candidate = _safe(year, month, day)
        return candidate

    # Fallback: one hour from now
    return now + timedelta(hours=1)


def platforms_for_provider(
    *,
    provider_code: str,
    apify_platforms: list | None,
    serpapi_platforms: list | None,
    platforms: list | None,
) -> list:
    code = (provider_code or "").strip().lower()
    if code == "apify" and apify_platforms:
        return list(apify_platforms)
    if code == "serpapi" and serpapi_platforms:
        return list(serpapi_platforms)
    return list(platforms or [])
