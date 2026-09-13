"""JWT + Fernet encryption — replaces core.auth + SimpleJWT."""
import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
import jwt
from cryptography.fernet import Fernet, InvalidToken
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def _fernet() -> Fernet:
    key = settings.effective_encryption_key
    if not key:
        raise ValueError("FIELD_ENCRYPTION_KEY / SECRET_KEY not configured")
    derived = base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())
    return Fernet(derived)

def encrypt_auth_config(data: dict) -> str:
    payload = json.dumps(data or {}).encode()
    return _fernet().encrypt(payload).decode()

def decrypt_auth_config(enc: str) -> dict:
    if not enc:
        return {}
    try:
        return json.loads(_fernet().decrypt(enc.encode()))
    except (InvalidToken, ValueError, TypeError):
        return {}

def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.access_token_lifetime_minutes)
    to_encode = {**data, "exp": expire, "type": "access"}
    # ensure jti
    import uuid
    to_encode.setdefault("jti", str(uuid.uuid4()))
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)

def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_lifetime_days)
    to_encode = {**data, "exp": expire, "type": "refresh"}
    import uuid
    to_encode.setdefault("jti", str(uuid.uuid4()))
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
