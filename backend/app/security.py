import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()
SESSION_COOKIE = "cyberlab_session"
SESSION_HOURS = 12

def hash_password(password: str) -> str:
    return password_hasher.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)

def make_session_token() -> str:
    return secrets.token_urlsafe(32)

def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)
