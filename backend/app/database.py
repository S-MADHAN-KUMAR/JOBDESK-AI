"""SQLAlchemy async engine + session. Replaces django.db connection."""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# Convert psycopg sync DSN to async: postgresql -> postgresql+asyncpg or psycopg async
# We use psycopg (sync) for sync tasks and asyncpg for FastAPI. Support both.
def _async_dsn(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url

SYNC_DSN = settings.database_url
ASYNC_DSN = _async_dsn(SYNC_DSN)

engine = create_async_engine(ASYNC_DSN, pool_pre_ping=True, echo=settings.debug is False and False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
