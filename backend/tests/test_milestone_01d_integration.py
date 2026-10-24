"""End-to-end account lifecycle regressions verified during Milestone 01D integration."""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models import Role, Session, User
from app.security import digest_token, now
from test_milestone_01b import (ORIGIN, PASSWORD, admin_ready, latest_token, login,
                                register, verify_email)


def test_suspended_account_cannot_authenticate_until_reactivated(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    assert register(admin, "suspended@example.org").status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        target = db.query(User).filter_by(email="suspended@example.org").one()
        target_id = target.id

    with TestClient(app) as victim:
        victim.headers.update(ORIGIN)
        assert login(victim, "suspended@example.org").status_code == 200
        assert victim.get("/api/v1/users/me").status_code == 200

        suspended = admin.post(f"/api/v1/admin/users/{target_id}/suspend",
                               json={"reason": "Integration suspension"})
        assert suspended.status_code == 200, suspended.text
        assert victim.get("/api/v1/users/me").status_code == 401
        assert login(victim, "suspended@example.org").status_code == 401

        with dbmaker() as db:
            assert db.query(Session).filter_by(user_id=target_id, revoked=False).count() == 0

        assert admin.post(f"/api/v1/admin/users/{target_id}/reactivate",
                          json={"reason": "Integration reactivation"}).status_code == 200
        assert login(victim, "suspended@example.org").status_code == 200
        assert victim.get("/api/v1/users/me").status_code == 200


def test_stale_step_up_blocks_privileged_mutations_but_allows_reads(client, tmp_path):
    admin, dbmaker = client
    admin_id = admin_ready(admin, dbmaker)
    assert register(admin, "stale-stepup@example.org").status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        target_id = db.query(User).filter_by(email="stale-stepup@example.org").one().id

    token = admin.cookies.get("cyberlab_session")
    with dbmaker() as db:
        record = db.query(Session).filter_by(token_digest=digest_token(token)).one()
        stale = now() - timedelta(minutes=10)
        record.authenticated_at = stale
        record.mfa_verified_at = stale
        db.commit()

    # Listing accounts is role-scoped only; mutations require fresh step-up.
    assert admin.get("/api/v1/admin/users").status_code == 200
    blocked = admin.post(f"/api/v1/admin/users/{target_id}/suspend",
                         json={"reason": "Stale step-up probe"})
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Recent authentication required"
    assert admin.post(f"/api/v1/admin/users/{admin_id}/roles",
                      json={"role": "manager", "reason": "Stale step-up probe"}).status_code == 403

    refreshed = admin.post("/api/v1/auth/reauthenticate",
                           json={"password": PASSWORD, "mfa_code": _current_totp(dbmaker, admin_id)})
    assert refreshed.status_code == 200, refreshed.text
    assert admin.post(f"/api/v1/admin/users/{target_id}/suspend",
                      json={"reason": "Step-up refreshed"}).status_code == 200


def test_role_switch_is_scoped_to_the_calling_session(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    assert register(admin, "concurrent@example.org").status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        user_id = db.query(User).filter_by(email="concurrent@example.org").one().id
    assert admin.post(f"/api/v1/admin/users/{user_id}/roles",
                      json={"role": "instructor", "reason": "Concurrent session test"}).status_code == 200

    with TestClient(app) as first, TestClient(app) as second:
        first.headers.update(ORIGIN)
        second.headers.update(ORIGIN)
        assert login(first, "concurrent@example.org").status_code == 200
        assert login(second, "concurrent@example.org").status_code == 200
        assert first.post("/api/v1/auth/active-role", json={"role": "instructor"}).status_code == 200
        assert second.post("/api/v1/auth/active-role", json={"role": "instructor"}).status_code == 200
        assert first.get("/api/v1/users/me").json()["active_role"] == "instructor"
        assert second.post("/api/v1/auth/active-role", json={"role": "student"}).status_code == 200
        assert first.get("/api/v1/users/me").json()["active_role"] == "instructor"
        assert second.get("/api/v1/users/me").json()["active_role"] == "student"

        # A role the account does not hold can never be activated.
        assert first.post("/api/v1/auth/active-role", json={"role": "manager"}).status_code == 403

        sessions = first.get("/api/v1/users/me/sessions").json()
        other = next(item for item in sessions if not item["current"])
        assert first.delete(f"/api/v1/users/me/sessions/{other['id']}").status_code == 204
        assert second.get("/api/v1/users/me").status_code == 401


def _current_totp(dbmaker, user_id: str) -> str:
    import pyotp
    from app.models import MFAEnrollment
    from app.security import decrypt_secret, now

    with dbmaker() as db:
        enrollment = db.get(MFAEnrollment, user_id)
        secret = decrypt_secret(enrollment.secret_encrypted)
    # The enrollment confirmation already consumed the current counter, so use the
    # next window; the verifier accepts one step of clock drift.
    counter = int(now().timestamp() // 30) + 1
    return pyotp.TOTP(secret).at(counter * 30)
