"""Real Uvicorn integration for the trusted-proxy client-identity boundary.

TestClient never runs Uvicorn's server stack, which is exactly how the broken boundary
(the server rewriting ``scope["client"]`` before the app could authorize forwarding)
escaped detection. These tests start a real Uvicorn process through `app.run` with
production settings and drive it over TCP.
"""
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401  (register ORM models before create_all)
from app.database import Base
from app.models import RateLimitEvent

BACKEND_DIR = Path(__file__).resolve().parent.parent
ORIGIN = "http://localhost:3000"
WRONG = "Wrong-Password-2026!"
STARTUP_SECONDS = 30.0


def bucket_digest(action: str, subject: str = "") -> str:
    import hashlib

    return hashlib.sha256(f"{action}:{subject}".encode()).hexdigest()


def address_digest(ip: str) -> str:
    return bucket_digest("login_ip_failures", f"{ip}:")


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class Server:
    def __init__(self, tmp_path, trusted_proxies: str):
        self.db_path = tmp_path / f"uvicorn-{free_port()}.sqlite3"
        self.database_url = f"sqlite:///{self.db_path}"
        Base.metadata.create_all(create_engine(self.database_url))
        self.dbmaker = sessionmaker(bind=create_engine(self.database_url), expire_on_commit=False)
        self.port = free_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": os.environ.get("HOME", ""),
            "PYTHONPATH": str(BACKEND_DIR),
            "DATABASE_URL": self.database_url,
            "COOKIE_SECURE": "false",
            "APP_ENV": "development",
            "BIND_HOST": "127.0.0.1",
            "BIND_PORT": str(self.port),
            "RELOAD": "false",
            "TRUSTED_PROXY_IPS": trusted_proxies,
            "ALLOWED_ORIGINS": ORIGIN,
            "ALLOWED_HOSTS": "localhost,127.0.0.1",
            "FRONTEND_URL": ORIGIN,
            "MAIL_PROVIDER": "dev_capture",
            "MAIL_CAPTURE_DIR": str(tmp_path / "mail"),
            "MFA_ENCRYPTION_KEY": "Y2yfQ2m0Y2FzdC1rZXktZm9yLXRlc3RzLW9ubHk=",
        }
        self.process = subprocess.Popen(
            [sys.executable, "-m", "app.run"],
            cwd=str(BACKEND_DIR), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        self._await_ready()

    def _await_ready(self) -> None:
        deadline = time.monotonic() + STARTUP_SECONDS
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                output = self.process.stdout.read().decode(errors="replace") if self.process.stdout else ""
                raise RuntimeError(f"uvicorn exited during startup:\n{output[-2000:]}")
            try:
                if httpx.get(f"{self.base_url}/api/v1/health", timeout=1.0).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        raise RuntimeError("uvicorn did not become ready")

    def login(self, email: str, forwarded: str | None = None) -> int:
        headers = {"Origin": ORIGIN}
        if forwarded is not None:
            headers["x-forwarded-for"] = forwarded
        response = httpx.post(f"{self.base_url}/api/v1/auth/login",
                              json={"email": email, "password": WRONG}, headers=headers, timeout=10.0)
        return response.status_code

    def failure_digests(self) -> list[str]:
        with self.dbmaker() as db:
            return [row.key_digest for row in db.query(RateLimitEvent)
                    .filter_by(action="login_ip_failures").all()]

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)
        if self.process.stdout:
            self.process.stdout.close()


@pytest.fixture
def trusted_server(tmp_path):
    server = Server(tmp_path, trusted_proxies="127.0.0.1")
    try:
        yield server
    finally:
        server.stop()


@pytest.fixture
def untrusted_server(tmp_path):
    server = Server(tmp_path, trusted_proxies="")
    try:
        yield server
    finally:
        server.stop()


def test_real_uvicorn_preserves_the_socket_peer_for_forwarding_authorization(trusted_server):
    """The peer stays 127.0.0.1, so its single-hop forwarding claim is accepted."""
    assert trusted_server.login("uvicorn-peer@example.org", "203.0.113.7") == 401
    assert trusted_server.failure_digests() == [address_digest("203.0.113.7")]


def test_real_uvicorn_rejects_ambiguous_forwarding_without_panicking(trusted_server):
    assert trusted_server.login("uvicorn-ambiguous@example.org", "203.0.113.7, 198.51.100.4") == 401
    assert trusted_server.login("uvicorn-malformed@example.org", "not-an-ip") == 401
    assert trusted_server.login("uvicorn-empty@example.org", "") == 401
    assert trusted_server.failure_digests() == []


def test_real_uvicorn_canonicalizes_ipv6_forwarding(trusted_server):
    assert trusted_server.login("uvicorn-v6@example.org", "2001:db8::7") == 401
    assert trusted_server.login("uvicorn-v6-bracketed@example.org", "[2001:db8::7]") == 401
    assert trusted_server.failure_digests() == [address_digest("2001:db8::7"), address_digest("2001:db8::7")]


def test_two_verified_clients_get_independent_address_buckets(trusted_server):
    for index in range(20):
        assert trusted_server.login(f"client-a-{index}@example.org", "127.0.0.2") == 401
    assert trusted_server.login("client-a-21@example.org", "127.0.0.2") == 429

    assert trusted_server.login("client-b-1@example.org", "127.0.0.3") == 401

    digests = trusted_server.failure_digests()
    assert digests.count(address_digest("127.0.0.2")) == 20
    assert digests.count(address_digest("127.0.0.3")) == 1


def test_untrusted_server_ignores_forwarded_identity_and_keeps_account_limit(untrusted_server):
    """No trusted proxy: rotated forged addresses must not create fresh buckets."""
    statuses = [untrusted_server.login("forged-target@example.org", f"203.0.113.{index}")
                for index in range(9)]
    assert statuses[:8] == [401] * 8
    assert statuses[8] == 429
    assert untrusted_server.failure_digests() == []
