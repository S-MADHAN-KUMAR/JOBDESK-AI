"""Simple cache-backed IP rate limits for auth endpoints."""

from django.core.cache import cache
from rest_framework.exceptions import Throttled


def client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or 'unknown'


def enforce_rate_limit(request, scope: str, limit: int, window_seconds: int) -> None:
    key = f'rl:{scope}:{client_ip(request)}'
    count = cache.get(key) or 0
    if count >= limit:
        raise Throttled(detail=f'Too many {scope} attempts. Try again later.')
    if count == 0:
        cache.set(key, 1, window_seconds)
    else:
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, window_seconds)
