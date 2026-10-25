"""Trusted-proxy client identity: normalization, ambiguity rejection, and fail-safe.

The application resolves forwarded addresses itself (Uvicorn proxy handling is disabled
in `app.run`), so these tests pin the resolver contract: only a single well-formed address
from a configured immediate peer becomes a client identity, and anything else yields no
identity at all.
"""
import asyncio
import hashlib
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import RateLimitEvent
from app.security import (UntrustedForwardingGuard, forwarded_client_address, is_trusted_proxy,
                          normalize_ip, trusted_client_address)
from test_milestone_01b import ORIGIN

WRONG = "Wrong-Password-2026!"


def bucket_digest(action: str, subject: str = "") -> str:
    """Digest for an account-scoped bucket: ``action:email``."""
    return hashlib.sha256(f"{action}:{subject}".encode()).hexdigest()


def address_digest(ip: str) -> str:
    """Digest for an address-scoped bucket: ``action:<client>:`` with no identity."""
    return hashlib.sha256(f"login_ip_failures:{ip}:".encode()).hexdigest()


def failure_rows(dbmaker):
    with dbmaker() as db:
        return [row.key_digest for row in db.query(RateLimitEvent).filter_by(action="login_ip_failures").all()]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("203.0.113.9", "203.0.113.9"),
        ("  203.0.113.9  ", "203.0.113.9"),
        ('"203.0.113.9"', "203.0.113.9"),
        ("2001:db8::7", "2001:db8::7"),
        ("[2001:db8::7]", "2001:db8::7"),
        ("0:0:0:0:0:0:0:1", "::1"),
        ("::ffff:203.0.113.9", "203.0.113.9"),
        ("", None),
        ("   ", None),
        ("unknown", None),
        ("203.0.113.9:443", None),
        ("203.0.113.9, 198.51.100.4", None),
        ("[2001:db8::7", None),
        ("fe80::1%eth0", None),
    ],
)
def test_normalize_ip_accepts_only_ip_literals(raw, expected):
    assert normalize_ip(raw) == expected


@pytest.mark.parametrize(
    ("forwarded", "expected"),
    [
        ("203.0.113.9", "203.0.113.9"),
        (" 2001:db8::7 ", "2001:db8::7"),
        ("203.0.113.9, 198.51.100.4", None),
        ("203.0.113.9,203.0.113.10", None),
        ("203.0.113.9,", "203.0.113.9"),
        ("", None),
        ("garbage", None),
    ],
)
def test_single_hop_forwarding_only(forwarded, expected):
    assert forwarded_client_address(forwarded) == expected


def test_trusted_proxy_matching_is_canonical(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "::1, 127.0.0.1")
    assert is_trusted_proxy("0:0:0:0:0:0:0:1") is True
    assert is_trusted_proxy("127.0.0.1") is True
    assert is_trusted_proxy("127.0.0.2") is False
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "")
    assert is_trusted_proxy("127.0.0.1") is False


def test_guard_strips_forwarding_headers_from_untrusted_peers(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.9.8.7")
    received = {}

    async def downstream(scope, receive, send):
        received["headers"] = [name for name, _ in scope["headers"]]

    guard = UntrustedForwardingGuard(downstream)
    forward = [(b"x-forwarded-for", b"203.0.113.9"), (b"x-forwarded-proto", b"https"),
               (b"cookie", b"cyberlab_session=x")]

    asyncio.run(guard({"type": "http", "client": ("203.0.113.50", 5555), "headers": forward}, None, None))
    assert b"x-forwarded-for" not in received["headers"]
    assert b"cookie" in received["headers"]

    asyncio.run(guard({"type": "http", "client": ("10.9.8.7", 5555), "headers": forward}, None, None))
    assert b"x-forwarded-for" in received["headers"]


def _login(client, email, headers):
    return client.post("/api/v1/auth/login", json={"email": email, "password": WRONG}, headers=headers)


def test_verified_address_gets_its_own_bucket(client, monkeypatch):
    c, dbmaker = client
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")
    forwarded = {"x-forwarded-for": "203.0.113.9"}
    assert _login(c, "synthetic-target@example.org", forwarded).status_code == 401
    assert failure_rows(dbmaker) == [address_digest("203.0.113.9")]


def test_ipv6_and_mapped_identities_bucket_canonically(client, monkeypatch):
    c, dbmaker = client
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")
    assert _login(c, f"v6-{uuid4().hex[:6]}@example.org", {"x-forwarded-for": "2001:db8::7"}).status_code == 401
    assert _login(c, f"v6b-{uuid4().hex[:6]}@example.org", {"x-forwarded-for": "[2001:db8::7]"}).status_code == 401
    with dbmaker() as db:
        rows = [row for row in db.query(RateLimitEvent).filter_by(action="login_ip_failures").all()]
    digests = {row.key_digest for row in rows}
    assert digests == {address_digest("2001:db8::7")}
    assert len(rows) == 2


@pytest.mark.parametrize("forwarded", ["", "unknown", "203.0.113.9, 198.51.100.4", "203.0.113.9:443"])
def test_unusable_forwarding_never_creates_an_address_bucket(client, monkeypatch, forwarded):
    c, dbmaker = client
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    assert _login(c, f"bad-{uuid4().hex[:6]}@example.org", headers).status_code == 401
    assert failure_rows(dbmaker) == []


def test_untrusted_peer_forwarding_is_ignored(client, monkeypatch):
    c, dbmaker = client
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "")
    for index in range(5):
        assert _login(c, f"untrusted-{index}@example.org",
                      {"x-forwarded-for": f"203.0.113.{index}"}).status_code == 401
    assert failure_rows(dbmaker) == []


def test_trusted_proxy_without_forwarding_header_is_unverified(client, monkeypatch):
    c, dbmaker = client
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")
    assert _login(c, "no-header@example.org", {}).status_code == 401
    assert failure_rows(dbmaker) == []
