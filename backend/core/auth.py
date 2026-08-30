from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from core.auth_cookies import ACCESS_COOKIE

BLACKLIST_PREFIX = 'blacklist:jti:'


def blacklist_jti(jti, ttl):
    cache.set(f'{BLACKLIST_PREFIX}{jti}', '1', timeout=ttl)


def is_jti_blacklisted(jti):
    return cache.get(f'{BLACKLIST_PREFIX}{jti}') is not None


class RedisBlacklistJWTAuthentication(JWTAuthentication):
    """JWT auth from Bearer header or HttpOnly access cookie."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            raw = request.COOKIES.get(ACCESS_COOKIE)
            if not raw:
                return None
            validated = self.get_validated_token(raw)
            return self.get_user(validated), validated
        return super().authenticate(request)

    def get_user(self, validated_token):
        if is_jti_blacklisted(validated_token['jti']):
            raise InvalidToken('Token is blacklisted')
        return super().get_user(validated_token)