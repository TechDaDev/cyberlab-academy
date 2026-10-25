"""Password, token, MFA, and request security helpers."""
import hashlib
import hmac
import ipaddress
import os
import secrets
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pyotp
from cryptography.fernet import Fernet
from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DbSession

from .models import MFAEnrollment, MFARecoveryCode, RateLimitEvent

password_hasher = PasswordHash.recommended()
SESSION_COOKIE = "cyberlab_session"
SESSION_HOURS = 12

# Password hashing is the expensive part of an unauthenticated authentication request.
# A bounded number of hashes may run at once so a flood cannot exhaust CPU, but this is
# pure admission control: it holds no per-identity state, is released as soon as a hash
# finishes, and therefore cannot lock an account out for a fixed window the way a
# counted rate-limit bucket can.
AUTH_HASH_CONCURRENCY = max(1, int(os.getenv("AUTH_HASH_CONCURRENCY", "16") or 16))
AUTH_HASH_QUEUE_SECONDS = max(0.0, float(os.getenv("AUTH_HASH_QUEUE_SECONDS", "2") or 2))
_hash_slots = threading.BoundedSemaphore(AUTH_HASH_CONCURRENCY)


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def require_strong_password(password: str, *, email: str = "", full_name: str = "") -> None:
    if not 12 <= len(password) <= 128:
        raise HTTPException(status_code=422, detail="Password must be 12 to 128 characters")
    lowered = password.casefold()
    if lowered in {"passwordpassword", "123456789012", "qwertyqwerty"}:
        raise HTTPException(status_code=422, detail="Password is too common")
    local_part = normalize_email(email).split("@", 1)[0] if email else ""
    if len(local_part) >= 4 and local_part in lowered:
        raise HTTPException(status_code=422, detail="Password must not contain email name")
    if full_name and len(full_name.strip()) >= 4 and full_name.strip().casefold() in lowered:
        raise HTTPException(status_code=422, detail="Password must not contain full name")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


@contextmanager
def _crypto_slot():
    if not _hash_slots.acquire(timeout=AUTH_HASH_QUEUE_SECONDS):
        raise HTTPException(status_code=503, detail="Authentication capacity saturated",
                            headers={"Retry-After": "1"})
    try:
        yield
    finally:
        _hash_slots.release()


def verify_password_guarded(password: str, password_hash: str) -> bool:
    """Verify a password while bounding concurrent hashing work."""
    with _crypto_slot():
        return verify_password(password, password_hash)


def hash_password_guarded(password: str) -> str:
    """Hash a password while bounding concurrent hashing work."""
    with _crypto_slot():
        return hash_password(password)


def make_session_token() -> str:
    return secrets.token_urlsafe(32)


def digest_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def expires_at() -> datetime:
    return now() + timedelta(hours=SESSION_HOURS)


def require_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed = {entry.strip() for entry in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if entry.strip()}
    if origin not in allowed or request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(status_code=403, detail="Trusted Origin required")


def normalize_ip(value: str) -> str | None:
    """Return a canonical text form of an IP literal, or ``None`` when it is not one.

    Accepts bare IPv4/IPv6 as used in ``X-Forwarded-For`` and bracketed IPv6
    (``[2001:db8::1]``). Anything else — hostnames, ports, zones, lists — is rejected so
    a malformed value can never become a throttle identity.
    """
    candidate = value.strip().strip('"').strip()
    if not candidate:
        return None
    if candidate.startswith("[") and candidate.endswith("]"):
        candidate = candidate[1:-1]
    try:
        parsed = ipaddress.ip_address(candidate)
    except ValueError:
        return None
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.scope_id is not None:
        return None  # zone identifiers are host-local and cannot identify a client
    if parsed.version == 6 and parsed.ipv4_mapped is not None:
        return str(parsed.ipv4_mapped)
    return str(parsed)


def trusted_proxy_addresses() -> set[str]:
    """Peers allowed to speak for a downstream client via X-Forwarded-For."""
    configured = {
        entry.strip()
        for entry in os.getenv("TRUSTED_PROXY_IPS", "").split(",")
        if entry.strip()
    }
    # Compare canonically so "::1" and "0:0:0:0:0:0:0:1" are the same proxy.
    return {normalize_ip(entry) or entry for entry in configured}


def is_trusted_proxy(peer: str | None) -> bool:
    if not peer:
        return False
    configured = trusted_proxy_addresses()
    return bool(configured) and (peer in configured or (normalize_ip(peer) or peer) in configured)


def socket_peer(request: Request) -> str:
    """The immediate peer that opened the connection to this process."""
    return request.client.host if request.client else "unknown"


def forwarded_client_address(forwarded: str) -> str | None:
    """Resolve a single-hop ``X-Forwarded-For`` value, or ``None`` when ambiguous.

    The trusted ingress is required to *overwrite* the header, so a well-formed value is
    exactly one IP literal. Several hops mean at least one untrusted writer, and the
    header is then unusable: silently picking a hop would let a client choose its
    identity.
    """
    hops = [hop for hop in forwarded.split(",") if hop.strip()]
    if len(hops) != 1:
        return None
    return normalize_ip(hops[0])


def trusted_client_address(request: Request) -> str | None:
    """Return a verified downstream client address, or ``None`` when unverifiable.

    Forwarded data is accepted only when the *immediate socket peer* is a configured
    trusted proxy and it supplied exactly one valid address. The application resolves
    this itself and Uvicorn proxy rewriting is disabled (see ``app.run``), so the peer
    checked here is always the real connection peer.
    """
    if not is_trusted_proxy(socket_peer(request)):
        return None
    return forwarded_client_address(request.headers.get("x-forwarded-for", ""))


def client_address(request: Request) -> str:
    """Resolve the socket peer used for accounting, never a client-supplied value."""
    return socket_peer(request)


FORWARDING_HEADERS = {b"x-forwarded-for", b"x-forwarded-proto", b"x-forwarded-host", b"forwarded"}


class UntrustedForwardingGuard:
    """Discard forwarding headers supplied by a peer that is not a trusted proxy.

    Defense in depth for the resolver above: even if a server or middleware rewrote the
    peer address, an untrusted connection can never leave a forwarding header behind for
    other code to misread. Trust is decided once, from the connection peer.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in {"http", "websocket"} and not is_trusted_proxy(
            (scope.get("client") or (None, None))[0]
        ):
            scope = dict(scope)
            scope["headers"] = [
                (name, value) for name, value in scope["headers"]
                if name.lower() not in FORWARDING_HEADERS
            ]
        await self.app(scope, receive, send)


def check_rate_limit(db: DbSession, request: Request, action: str, identity: str = "",
                     limit: int = 10, seconds: int = 60, *, client_scoped: bool = True,
                     trusted_client_only: bool = False) -> None:
    """Count an event against a bucket and raise 429 when the bucket is full.

    ``trusted_client_only`` buckets are skipped unless the request carries a verified
    downstream client address. Client-scoped buckets keyed on a shared, unverified
    proxy address would let one caller deny the endpoint to everybody else behind it,
    so they are only enforced inside a documented trusted-proxy boundary.
    """
    verified_client = trusted_client_address(request)
    if trusted_client_only and verified_client is None:
        return
    # Hash the identity and client address so the table does not store either value.
    # A verified downstream address is preferred so clients behind a trusted proxy get
    # independent buckets; otherwise accounting falls back to the socket peer.
    client = verified_client or client_address(request)
    subject = f"{client}:{normalize_email(identity)}" if client_scoped else normalize_email(identity)
    key = hashlib.sha256(f"{action}:{subject}".encode()).hexdigest()
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        lock_key = int(key[:15], 16)
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    cutoff = now() - timedelta(seconds=seconds)
    count = db.scalar(select(func.count()).select_from(RateLimitEvent).where(
        RateLimitEvent.action == action, RateLimitEvent.key_digest == key, RateLimitEvent.created_at >= cutoff)) or 0
    if count >= limit:
        raise HTTPException(status_code=429, detail="Too many requests")
    db.add(RateLimitEvent(key_digest=key, action=action))
    db.commit()


def fernet() -> Fernet:
    key = os.getenv("MFA_ENCRYPTION_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="MFA encryption key is not configured")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="MFA encryption key is invalid") from exc


def encrypt_secret(secret: str) -> str:
    return fernet().encrypt(secret.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return fernet().decrypt(ciphertext.encode()).decode()


def verify_totp(enrollment: MFAEnrollment, code: str) -> bool:
    if not code.isdigit() or len(code) != 6:
        return False
    totp = pyotp.TOTP(decrypt_secret(enrollment.secret_encrypted))
    current = int(now().timestamp() // 30)
    for counter in (current - 1, current, current + 1):
        if counter > enrollment.last_counter and hmac.compare_digest(totp.at(counter * 30), code):
            enrollment.last_counter = counter
            return True
    return False


def recovery_digest(code: str) -> str:
    return digest_token("recovery:" + code)


def consume_mfa(db: DbSession, enrollment: MFAEnrollment, code: str) -> bool:
    if verify_totp(enrollment, code):
        return True
    record = db.scalar(select(MFARecoveryCode).where(
        MFARecoveryCode.user_id == enrollment.user_id,
        MFARecoveryCode.code_digest == recovery_digest(code),
        MFARecoveryCode.used_at.is_(None)).with_for_update())
    if record:
        record.used_at = now()
        return True
    return False
