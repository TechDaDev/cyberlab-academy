"""Rate-limit identity regressions from the Milestone 01D security review.

The Next.js proxy reaches FastAPI from a single loopback address, so without a
verified trusted-proxy chain every browser shares one peer identity. These tests pin
the rule that an unauthenticated caller must never be able to exhaust a shared bucket
and lock unrelated accounts out of login, registration, or account recovery.
"""
import pytest
from fastapi.testclient import TestClient

from app import routes_auth
from app.main import app
from app.models import AuditEvent, RateLimitEvent, User
from test_milestone_01b import ORIGIN, PASSWORD, login, register, verify_email

WRONG = "Wrong-Password-2026!"
FAILED_LOGIN_LIMIT = 8


def _failed_login(client, email: str, headers: dict | None = None):
    return client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": WRONG},
        headers=headers or {},
    )


@pytest.fixture
def fast_password_check(monkeypatch):
    """Keep the 300-attempt regression fast; throttling, not hashing, is under test."""
    monkeypatch.setattr(
        routes_auth,
        "verify_password_guarded",
        lambda password, password_hash: password_hash == f"plain:{password}",
    )
    monkeypatch.setattr(
        routes_auth,
        "hash_password_guarded",
        lambda password: f"plain:{password}",
    )


def test_three_hundred_unrelated_failures_do_not_block_a_valid_login(client, tmp_path, fast_password_check):
    c, _ = client
    assert register(c, "threshold@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as shared:
        shared.headers.update(ORIGIN)
        statuses = {_failed_login(shared, f"unknown{index}@example.org").status_code for index in range(300)}
        assert statuses == {401}
        assert login(shared, "threshold@example.org").status_code == 200
        assert shared.get("/api/v1/users/me").status_code == 200


def test_repeated_failures_for_one_account_are_still_throttled(client, tmp_path, fast_password_check):
    c, _ = client
    assert register(c, "targeted@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        statuses = [_failed_login(attacker, "targeted@example.org").status_code
                    for _ in range(FAILED_LOGIN_LIMIT + 2)]
        assert statuses[:FAILED_LOGIN_LIMIT] == [401] * FAILED_LOGIN_LIMIT
        assert statuses[FAILED_LOGIN_LIMIT] == 429
        assert statuses[-1] == 429

    # Correct credentials are never blocked by buckets filled by someone else.
    with TestClient(app) as owner:
        owner.headers.update(ORIGIN)
        assert login(owner, "targeted@example.org").status_code == 200


def test_forged_forwarded_address_cannot_create_fresh_buckets(monkeypatch, client, tmp_path, fast_password_check):
    c, _ = client
    assert register(c, "forged@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        for index in range(FAILED_LOGIN_LIMIT):
            response = _failed_login(attacker, "forged@example.org",
                                     {"x-forwarded-for": f"203.0.113.{index}"})
            assert response.status_code == 401
        blocked = _failed_login(attacker, "forged@example.org", {"x-forwarded-for": "198.51.100.9"})
        assert blocked.status_code == 429

        # The same forged headers must not create a shared-address lockout either.
        for index in range(60):
            assert _failed_login(attacker, f"spray{index}@example.org",
                                 {"x-forwarded-for": f"192.0.2.{index}"}).status_code == 401
        assert login(attacker, "forged@example.org").status_code == 200


def test_forwarded_addresses_get_independent_buckets_behind_a_trusted_proxy(monkeypatch, client, tmp_path, fast_password_check):
    c, _ = client
    assert register(c, "proxied@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        for _ in range(FAILED_LOGIN_LIMIT + 1):
            attacker.post("/api/v1/auth/login",
                          json={"email": "proxied@example.org", "password": WRONG},
                          headers={"x-forwarded-for": "203.0.113.10"})
        exhausted = _failed_login(attacker, "proxied@example.org", {"x-forwarded-for": "203.0.113.10"})
        assert exhausted.status_code == 429

        other_client = _failed_login(attacker, "proxied@example.org", {"x-forwarded-for": "203.0.113.11"})
        assert other_client.status_code == 401


def test_successful_login_still_issues_and_revokes_sessions(client, tmp_path, fast_password_check):
    c, _ = client
    assert register(c, "session@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as session_client:
        session_client.headers.update(ORIGIN)
        assert login(session_client, "session@example.org").status_code == 200
        assert session_client.cookies.get("cyberlab_session")
        assert session_client.get("/api/v1/users/me").status_code == 200
        assert session_client.post("/api/v1/auth/logout").status_code == 204
        assert session_client.get("/api/v1/users/me").status_code == 401


def test_shared_address_cannot_block_recovery_or_registration(client, tmp_path, fast_password_check):
    c, dbmaker = client
    assert register(c, "recoverable@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    mail_dir = tmp_path / "mail"
    before = len(list(mail_dir.glob("*.json")))

    with TestClient(app) as shared:
        shared.headers.update(ORIGIN)
        for index in range(80):
            response = shared.post("/api/v1/auth/forgot-password",
                                   json={"email": f"nobody{index}@example.org"})
            assert response.status_code == 200
        reset_request = shared.post("/api/v1/auth/forgot-password",
                                    json={"email": "recoverable@example.org"})
        assert reset_request.status_code == 200
        assert len(list(mail_dir.glob("*.json"))) == before + 1

        for index in range(30):
            payload = {
                "full_name": "Synthetic Learner",
                "email": f"bulk{index}@example.org",
                "password": PASSWORD,
                "password_confirmation": PASSWORD,
            }
            assert shared.post("/api/v1/auth/register", json=payload).status_code == 202
        legitimate = {
            "full_name": "Legitimate Learner",
            "email": "legitimate@example.org",
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
        }
        assert shared.post("/api/v1/auth/register", json=legitimate).status_code == 202

    with dbmaker() as db:
        assert db.query(User).filter_by(email="legitimate@example.org").count() == 1


def test_failed_login_attempts_still_audit(client, tmp_path, fast_password_check, dbmaker=None):
    c, dbmaker = client
    assert register(c, "audited@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        assert _failed_login(attacker, "audited@example.org").status_code == 401

    with dbmaker() as db:
        assert db.query(AuditEvent).filter_by(action="auth.login_failed").count() >= 1
        actions = {row.action for row in db.query(RateLimitEvent).all()}
        assert "login" in actions
        # No counted pre-authentication bucket remains for a shared address.
        assert "login_ip" not in actions
