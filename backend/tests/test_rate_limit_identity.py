"""Rate-limit identity regressions from the independent Milestone 01D QA review.

The Next.js proxy reaches FastAPI from a single loopback address, so every browser
shares one peer identity. These tests pin the behaviour that a caller who cannot
authenticate must not lock unrelated accounts out of the login endpoint.
"""
from fastapi.testclient import TestClient

from app.main import app
from test_milestone_01b import ORIGIN, PASSWORD, login, register, verify_email


def _failed_login(client, email: str, password: str = "Wrong-Password-2026!"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_unrelated_failures_do_not_block_a_valid_login(client, tmp_path):
    c, _ = client
    assert register(c, "qavictim@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as shared:
        shared.headers.update(ORIGIN)
        # 45 failed attempts for 45 different addresses, all from the same peer address.
        for index in range(45):
            assert _failed_login(shared, f"unknown{index}@example.org").status_code == 401
        # A correct login for an unrelated verified account must still succeed.
        assert login(shared, "qavictim@example.org").status_code == 200
        assert shared.get("/api/v1/users/me").status_code == 200


def test_repeated_failures_for_one_account_are_throttled(client, tmp_path):
    c, _ = client
    assert register(c, "qathrottle@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        statuses = [_failed_login(attacker, "qathrottle@example.org").status_code for _ in range(9)]
        assert statuses[:8] == [401] * 8
        assert statuses[8] == 429

    # The account itself is still reachable with the correct password.
    with TestClient(app) as owner:
        owner.headers.update(ORIGIN)
        assert login(owner, "qathrottle@example.org").status_code == 200


def test_forwarded_addresses_are_ignored_from_untrusted_peers(monkeypatch, client, tmp_path):
    c, _ = client
    assert register(c, "qauntrusted@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        # Rotating a spoofed X-Forwarded-For must not create fresh buckets.
        for index in range(8):
            spoofed = {"x-forwarded-for": f"203.0.113.{index}"}
            response = attacker.post(
                "/api/v1/auth/login",
                json={"email": "qauntrusted@example.org", "password": "Wrong-Password-2026!"},
                headers=spoofed,
            )
            assert response.status_code == 401
        blocked = attacker.post(
            "/api/v1/auth/login",
            json={"email": "qauntrusted@example.org", "password": "Wrong-Password-2026!"},
            headers={"x-forwarded-for": "198.51.100.9"},
        )
        assert blocked.status_code == 429


def test_forwarded_addresses_are_honoured_from_trusted_proxies(monkeypatch, client, tmp_path):
    c, _ = client
    assert register(c, "qatrusted@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "testclient")

    with TestClient(app) as attacker:
        attacker.headers.update(ORIGIN)
        for _ in range(9):
            attacker.post(
                "/api/v1/auth/login",
                json={"email": "qatrusted@example.org", "password": "Wrong-Password-2026!"},
                headers={"x-forwarded-for": "203.0.113.10"},
            )
        exhausted = attacker.post(
            "/api/v1/auth/login",
            json={"email": "qatrusted@example.org", "password": "Wrong-Password-2026!"},
            headers={"x-forwarded-for": "203.0.113.10"},
        )
        assert exhausted.status_code == 429

        # A different browser behind the same trusted proxy gets its own bucket.
        other_client = attacker.post(
            "/api/v1/auth/login",
            json={"email": "qatrusted@example.org", "password": "Wrong-Password-2026!"},
            headers={"x-forwarded-for": "203.0.113.11"},
        )
        assert other_client.status_code == 401

    # Correct credentials are never blocked by exhausted failure buckets.
    with TestClient(app) as owner:
        owner.headers.update(ORIGIN)
        assert login(owner, "qatrusted@example.org").status_code == 200
