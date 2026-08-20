from django.core.cache import cache
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

BLACKLIST_PREFIX = 'blacklist:jti:'


def blacklist_jti(jti, ttl):
    cache.set(f'{BLACKLIST_PREFIX}{jti}', '1', timeout=ttl)


def is_jti_blacklisted(jti):
    return cache.get(f'{BLACKLIST_PREFIX}{jti}') is not None


class RedisBlacklistJWTAuthentication(JWTAuthentication):
    """JWT authentication that also rejects access tokens blacklisted in Redis."""

    def get_user(self, validated_token):
        if is_jti_blacklisted(validated_token['jti']):
            raise InvalidToken('Token is blacklisted')
        return super().get_user(validated_token)