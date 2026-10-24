"""Additional Milestone 01B security regression tests."""
import hashlib
import os
import stat

import pyotp
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.bootstrap_admin import bootstrap_admin
from app.main import app
from app.models import InstructorRequest, MFAEnrollment, MFARecoveryCode, OneTimeToken, User
from app.security import check_rate_limit
from test_milestone_01b import (ORIGIN, PASSWORD, admin_ready, latest_token, login,
                                register, verify_email)


def request_from(host: str) -> Request:
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [],
                    "client": (host, 1234)})


def test_duplicate_registration_normalizes_email_and_hashes_tokens(client, tmp_path):
    c, dbmaker = client
    assert register(c, "Case.User@Example.org").status_code == 202
    assert register(c, "case.user@example.org").status_code == 202
    with dbmaker() as db:
        users = db.query(User).all()
        assert len(users) == 1
        assert users[0].email == "case.user@example.org"
        record = db.query(OneTimeToken).one()
    raw = latest_token(tmp_path / "mail")
    assert record.token_digest == hashlib.sha256(raw.encode("utf-8")).hexdigest()
    assert record.token_digest != raw
    assert len(record.token_digest) == 64


def test_instructor_cannot_approve_own_application(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    assert register(admin, "self-review@example.org", instructor=True).status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        applicant = db.query(User).filter_by(email="self-review@example.org").one()
        applicant_id = applicant.id
        application_id = db.query(InstructorRequest).filter_by(user_id=applicant_id).one().id
    assert admin.post(f"/api/v1/admin/users/{applicant_id}/roles",
        json={"role": "instructor", "reason": "Provisional teaching role"}).status_code == 200
    with TestClient(app) as instructor:
        instructor.headers.update(ORIGIN)
        assert login(instructor, "self-review@example.org").status_code == 200
        assert instructor.post("/api/v1/auth/active-role", json={"role": "instructor"}).status_code == 200
        response = instructor.post(f"/api/v1/admin/instructor-applications/{application_id}/approve",
                                   json={"reason": "Self approval"})
        assert response.status_code == 403


def test_manager_cannot_modify_privileged_accounts(client, tmp_path):
    admin, dbmaker = client
    admin_id = admin_ready(admin, dbmaker)
    manager_ids = []
    for address in ("first-manager@example.org", "second-manager@example.org"):
        assert register(admin, address).status_code == 202
        assert verify_email(admin, tmp_path / "mail").status_code == 200
        with dbmaker() as db:
            user_id = db.query(User).filter_by(email=address).one().id
        assert admin.post(f"/api/v1/admin/users/{user_id}/roles",
            json={"role": "manager", "reason": "Staff assignment"}).status_code == 200
        manager_ids.append(user_id)
    with TestClient(app) as manager:
        manager.headers.update(ORIGIN)
        assert login(manager, "first-manager@example.org").status_code == 200
        assert manager.post("/api/v1/auth/active-role", json={"role": "manager"}).status_code == 200
        assert manager.post(f"/api/v1/admin/users/{admin_id}/suspend",
            json={"reason": "Privilege escalation"}).status_code == 403
        assert manager.request("DELETE", f"/api/v1/admin/users/{admin_id}/roles/administrator",
            json={"reason": "Privilege escalation"}).status_code == 403
        assert manager.post(f"/api/v1/admin/users/{manager_ids[1]}/suspend",
            json={"reason": "Peer suspension"}).status_code == 403
        assert manager.request("DELETE", f"/api/v1/admin/users/{manager_ids[1]}/roles/manager",
            json={"reason": "Peer revocation"}).status_code == 403


def test_bootstrap_cannot_repeat_after_administrator_removed(client):
    c, dbmaker = client
    with dbmaker() as db:
        bootstrap_admin(db, email="bootstrap@example.org", full_name="Synthetic Administrator",
                        password=PASSWORD)
    with dbmaker() as db:
        user = db.query(User).filter_by(email="bootstrap@example.org").one()
        user.roles.clear()
        db.commit()
    with dbmaker() as db, pytest.raises(ValueError, match="already completed"):
        bootstrap_admin(db, email="replacement@example.org", full_name="Replacement Administrator",
                        password=PASSWORD)
    assert login(c, "bootstrap@example.org").status_code == 401


def test_email_change_to_existing_address_is_not_disclosed(client, tmp_path):
    c, dbmaker = client
    for address in ("victim@example.org", "attacker@example.org"):
        assert register(c, address).status_code == 202
        assert verify_email(c, tmp_path / "mail").status_code == 200
    mail_dir = tmp_path / "mail"
    before = len(list(mail_dir.glob("*.json")))
    assert login(c, "attacker@example.org").status_code == 200
    response = c.post("/api/v1/users/me/email",
                      json={"new_email": "victim@example.org", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json() == {"message": "If eligible, check the new email address"}
    assert len(list(mail_dir.glob("*.json"))) == before
    with dbmaker() as db:
        victim = db.query(User).filter_by(email="victim@example.org").one()
        assert victim.email_verified


def test_mfa_secrets_and_recovery_codes_are_not_stored_or_exposed(client):
    c, dbmaker = client
    with dbmaker() as db:
        bootstrap_admin(db, email="mfa-admin@example.org", full_name="Synthetic Administrator",
                        password=PASSWORD)
    assert login(c, "mfa-admin@example.org").status_code == 200
    assert c.post("/api/v1/auth/mfa/enroll").status_code == 422
    assert c.post("/api/v1/auth/mfa/enroll", json={"password": "Wrong-Password-2026!"}).status_code == 401
    with TestClient(app) as older_session:
        older_session.headers.update(ORIGIN)
        assert login(older_session, "mfa-admin@example.org").status_code == 200
        secret = c.post("/api/v1/auth/mfa/enroll", json={"password": PASSWORD}).json()["secret"]
        codes = c.post("/api/v1/auth/mfa/confirm",
                       json={"code": pyotp.TOTP(secret).now()}).json()["recovery_codes"]
        assert older_session.get("/api/v1/users/me").status_code == 401
    with dbmaker() as db:
        enrollment = db.query(MFAEnrollment).one()
        assert enrollment.enabled
        assert secret not in enrollment.secret_encrypted
        stored = [entry.code_digest for entry in db.query(MFARecoveryCode).all()]
        assert len(stored) == len(codes) == 8
        assert not set(stored) & set(codes)
        assert all(len(digest) == 64 for digest in stored)
    profile = c.get("/api/v1/users/me").json()
    assert "password_hash" not in profile
    assert "email_verified" in profile
    session_payload = c.get("/api/v1/users/me/sessions").json()
    assert all("token" not in item and "token_digest" not in item for item in session_payload)


@pytest.mark.skipif(os.name != "posix", reason="POSIX file modes required")
def test_development_mail_capture_is_private(client, tmp_path):
    c, _ = client
    assert register(c, "private-mail@example.org").status_code == 202
    mail_dir = tmp_path / "mail"
    assert stat.S_IMODE(mail_dir.stat().st_mode) == 0o700
    messages = list(mail_dir.glob("*.json"))
    assert messages
    assert all(stat.S_IMODE(item.stat().st_mode) == 0o600 for item in messages)
    assert c.get("/api/v1/mail").status_code == 404
    assert c.get("/mail").status_code == 404


def test_account_rate_limit_spans_client_addresses(client):
    c, dbmaker = client
    with dbmaker() as db:
        for index in range(3):
            check_rate_limit(db, request_from(f"10.0.0.{index}"), "unit", "User@Example.org",
                             limit=3, seconds=60, client_scoped=False)
        with pytest.raises(HTTPException) as raised:
            check_rate_limit(db, request_from("10.0.0.9"), "unit", "user@example.org",
                             limit=3, seconds=60, client_scoped=False)
    assert raised.value.status_code == 429
