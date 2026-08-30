"""Server-side next-run calculation for ingestion schedules."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

from django.utils import timezone as dj_timezone

_TIME_RE = re.compile(
    r'^\s*(\d{1,2}):(\d{2})(?:\s*([AaPp]\.?[Mm]\.?))?\s*$'
)


def parse_12h_time(time_str: str) -> tuple[int, int]:
    """Parse '9:00 AM', '2:30PM', '14:30', or '2:30 p.m.' into 24h hour, minute."""
    raw = (time_str or '9:00 AM').strip()
    match = _TIME_RE.match(raw)
    if not match:
        return 9, 0

    hour = int(match.group(1))
    minute = int(match.group(2))
    period_raw = match.group(3)
    period = re.sub(r'[^APM]', '', period_raw.upper()) if period_raw else None

    if period == 'AM':
        if hour == 12:
            hour = 0
    elif period == 'PM':
        if hour != 12:
            hour += 12
    elif hour > 23:
        return 9, 0

    hour = max(0, min(23, hour))
    minute = max(0, min(59, minute))
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
    Compute the next fire time for a schedule in Django TIME_ZONE
    (Asia/Kolkata by default). Wall-clock times from the UI are local, not UTC.

    `after` defaults to now. For recurring schedules after a successful fire,
    pass the previous next_run (or now) so we advance to the following slot.
    """
    now = after or dj_timezone.now()
    if dj_timezone.is_naive(now):
        now = _aware(now)

    hour, minute = parse_12h_time(time_str)
    tz = dj_timezone.get_current_timezone()
    local_now = dj_timezone.localtime(now, tz)
    initial = after is None
    grace = timedelta(minutes=2)

    def at_date(d: date) -> datetime:
        return _aware(datetime.combine(d, time(hour=hour, minute=minute)))

    if frequency == 'once':
        base = start_date or local_now.date()
        candidate = at_date(base)
        if candidate <= now:
            return now + timedelta(minutes=1)
        return candidate

    min_date = start_date if start_date and start_date > local_now.date() else local_now.date()
    candidate = at_date(min_date)

    if frequency == 'daily':
        if candidate <= local_now:
            if initial and (local_now - candidate) <= grace:
                return now + timedelta(minutes=1)
            candidate = candidate + timedelta(days=1)
        return candidate

    if frequency == 'weekly':
        current_day = local_now.weekday()  # Mon=0..Sun=6
        target = int(day_of_week) % 7
        js_current = (current_day + 1) % 7  # convert Mon=0 -> Sun=0 style
        days_until = target - js_current
        if days_until < 0:
            days_until += 7
        if days_until == 0 and candidate <= local_now:
            if initial and (local_now - candidate) <= grace:
                return now + timedelta(minutes=1)
            days_until = 7
        candidate = at_date(local_now.date()) + timedelta(days=days_until)
        if start_date and candidate.date() < start_date:
            extra = (start_date - candidate.date()).days
            weeks = (extra + 6) // 7
            candidate = candidate + timedelta(weeks=weeks)
        return candidate

    if frequency == 'monthly':
        day = max(1, min(31, int(day_of_month or 1)))
        year, month = local_now.year, local_now.month
        if start_date and start_date > local_now.date():
            year, month = start_date.year, start_date.month

        def _safe(y: int, m: int, d: int) -> datetime:
            for try_day in range(d, 0, -1):
                try:
                    return _aware(datetime(y, m, try_day, hour, minute))
                except ValueError:
                    continue
            return _aware(datetime(y, m, 1, hour, minute))

        candidate = _safe(year, month, day)
        if candidate <= local_now:
            if initial and (local_now - candidate) <= grace:
                return now + timedelta(minutes=1)
            if month == 12:
                year, month = year + 1, 1
            else:
                month += 1
            candidate = _safe(year, month, day)
        return candidate

    return now + timedelta(hours=1)


def platforms_for_provider(
    *,
    provider_code: str,
    apify_platforms: list | None,
    serpapi_platforms: list | None,
    platforms: list | None,
) -> list:
    code = (provider_code or '').strip().lower()
    if code == 'apify' and apify_platforms:
        return list(apify_platforms)
    if code == 'serpapi' and serpapi_platforms:
        return list(serpapi_platforms)
    return list(platforms or [])
