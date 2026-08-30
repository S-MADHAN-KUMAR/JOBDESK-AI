"""Calendar-day usage counters for JobSource / EnrichmentSource."""

from __future__ import annotations

from django.db import models
from django.utils import timezone as dj_timezone


def ensure_daily_usage_counter(source: models.Model) -> models.Model:
    """
    Reset ``current_daily_uses`` when the local calendar day changes.

    Without this, "Daily usage" only increments and never rolls over, so
    yesterday's Apollo/ContactOut/SerpApi runs still show as today's usage.
    """
    today = dj_timezone.localdate()
    current_on = getattr(source, 'daily_uses_on', None)
    if current_on == today:
        return source

    type(source).objects.filter(pk=source.pk).update(
        current_daily_uses=0,
        daily_uses_on=today,
    )
    source.current_daily_uses = 0
    source.daily_uses_on = today
    return source


def bump_daily_usage(queryset: models.QuerySet, *, extra: dict | None = None) -> None:
    """Reset-per-row if needed, then increment each matched source by 1."""
    extra = extra or {}
    today = dj_timezone.localdate()
    for source in queryset:
        ensure_daily_usage_counter(source)
        updates = {
            'current_daily_uses': models.F('current_daily_uses') + 1,
            'daily_uses_on': today,
            **extra,
        }
        type(source).objects.filter(pk=source.pk).update(**updates)
