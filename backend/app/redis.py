"""Redis client — replaces django.core.cache / django-redis."""
import redis.asyncio as redis
from app.config import settings

_redis = None

def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis

BLACKLIST_PREFIX = "blacklist:jti:"

async def blacklist_jti(jti: str, ttl: int):
    r = get_redis()
    await r.set(f"{BLACKLIST_PREFIX}{jti}", "1", ex=ttl)

async def is_jti_blacklisted(jti: str) -> bool:
    r = get_redis()
    return await r.get(f"{BLACKLIST_PREFIX}{jti}") is not None
