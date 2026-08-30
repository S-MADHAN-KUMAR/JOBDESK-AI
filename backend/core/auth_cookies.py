"""HttpOnly JWT cookie helpers."""

from django.conf import settings


ACCESS_COOKIE = getattr(settings, 'JWT_ACCESS_COOKIE', 'da_access')
REFRESH_COOKIE = getattr(settings, 'JWT_REFRESH_COOKIE', 'da_refresh')


def _cookie_kwargs(*, max_age: int) -> dict:
    return {
        'httponly': True,
        'secure': not settings.DEBUG,
        'samesite': 'Lax',
        'path': '/',
        'max_age': max_age,
    }


def set_auth_cookies(response, access: str, refresh: str | None = None):
    access_age = int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
    response.set_cookie(ACCESS_COOKIE, access, **_cookie_kwargs(max_age=access_age))
    if refresh:
        refresh_age = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
        response.set_cookie(REFRESH_COOKIE, refresh, **_cookie_kwargs(max_age=refresh_age))
    return response


def clear_auth_cookies(response):
    response.delete_cookie(ACCESS_COOKIE, path='/')
    response.delete_cookie(REFRESH_COOKIE, path='/')
    return response
