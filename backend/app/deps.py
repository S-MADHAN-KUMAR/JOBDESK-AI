"""FastAPI dependencies — replaces DRF permissions."""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.security import decode_token
from app.redis import is_jti_blacklisted
from app.config import settings

bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    # Try Bearer header, then HttpOnly cookie
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(settings.jwt_access_cookie)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    jti = payload.get("jti")
    if jti and await is_jti_blacklisted(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token blacklisted")
    # Load user from DB
    from app.models.user import User
    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid payload")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user

def require_roles(*roles: str):
    async def _checker(user=Depends(get_current_user)):
        if user.role not in roles and user.role != "ADMIN":
            # ADMIN bypasses all role checks (mirrors Django IsAdmin permissive)
            if "ADMIN" not in roles and user.role != "ADMIN":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            if user.role not in roles:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user
    return _checker

require_admin = require_roles("ADMIN")
require_ceo = require_roles("ADMIN", "CEO_MANAGEMENT")
require_analyst = require_roles("ADMIN", "MARKET_ANALYST")
require_training = require_roles("ADMIN", "TRAINING_MANAGER")
require_recruitment = require_roles("ADMIN", "RECRUITMENT_TEAM")
