"""Security and account workflow regression tests for Milestone 01B."""
import json
from datetime import timedelta
from pathlib import Path

import pyotp
import pytest
from fastapi.testclient import TestClient

from app.bootstrap_admin import bootstrap_admin
from app.main import app
from app.models import InstructorRequest, OneTimeToken, Role, Session, User
from app.security import now

PASSWORD = "River-Granite-Copper-42!"
ORIGIN = {"Origin": "http://localhost:3000"}


def register(c, email, instructor=False):
    return c.post("/api/v1/auth/register", json={
        "full_name": "Synthetic Learner", "email": email, "password": PASSWORD,
        "password_confirmation": PASSWORD, "instructor_application": instructor,
    })


def login(c, email, password=PASSWORD):
    return c.post("/api/v1/auth/login", json={"email": email, "password": password})


def latest_token(mail_dir: Path) -> str:
    message = json.loads(max(mail_dir.glob("*.json"), key=lambda p: p.stat().st_mtime_ns).read_text())
    return message["body"].split("token=", 1)[1].splitlines()[0]


def verify_email(c, mail_dir):
    token = latest_token(mail_dir)
    return c.post("/api/v1/auth/verify-email", json={"token": token})


def admin_ready(c, dbmaker):
    with dbmaker() as db:
        bootstrap_admin(db, email="admin@example.org", full_name="Synthetic Administrator", password=PASSWORD)
    assert login(c, "admin@example.org").status_code == 200
    assert c.post("/api/v1/auth/active-role", json={"role": "administrator"}).status_code == 403
    enrolled = c.post("/api/v1/auth/mfa/enroll", json={"password": PASSWORD})
    assert enrolled.status_code == 200, enrolled.text
    code = pyotp.TOTP(enrolled.json()["secret"]).now()
    confirmed = c.post("/api/v1/auth/mfa/confirm", json={"code": code})
    assert confirmed.status_code == 200, confirmed.text
    assert len(confirmed.json()["recovery_codes"]) == 8
    switched = c.post("/api/v1/auth/active-role", json={"role": "administrator"})
    assert switched.status_code == 200, switched.text
    return switched.json()["id"]


def test_email_verification_expiration_and_replacement(client, tmp_path):
    c, dbmaker = client
    mail_dir = tmp_path / "mail"
    assert register(c, "first@example.org").status_code == 202
    first = latest_token(mail_dir)
    response = c.post("/api/v1/auth/verification/resend", json={"email": "first@example.org"})
    assert response.status_code == 200
    second = latest_token(mail_dir)
    assert second != first
    assert c.post("/api/v1/auth/verify-email", json={"token": first}).status_code == 400
    assert c.post("/api/v1/auth/verify-email", json={"token": second}).status_code == 200
    assert c.post("/api/v1/auth/verify-email", json={"token": second}).status_code == 400
    with dbmaker() as db:
        assert db.query(User).filter_by(email="first@example.org").one().email_verified
    assert register(c, "expired@example.org").status_code == 202
    expired = latest_token(mail_dir)
    with dbmaker() as db:
        record = db.query(OneTimeToken).filter_by(user_id=db.query(User).filter_by(email="expired@example.org").one().id).one()
        record.expires_at = now() - timedelta(minutes=1)
        db.commit()
    assert c.post("/api/v1/auth/verify-email", json={"token": expired}).status_code == 400


def test_password_reset_reuse_session_revocation_and_generic_response(client, tmp_path):
    c, dbmaker = client
    assert register(c, "reset@example.org").status_code == 202
    assert login(c, "reset@example.org").status_code == 200
    known = c.post("/api/v1/auth/forgot-password", json={"email": "reset@example.org"})
    unknown = c.post("/api/v1/auth/forgot-password", json={"email": "absent@example.org"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    token = latest_token(tmp_path / "mail")
    changed = "Cedar-Quartz-Lake-57!"
    payload = {"token": token, "password": changed, "password_confirmation": changed}
    assert c.post("/api/v1/auth/reset-password", json=payload).status_code == 200
    assert c.get("/api/v1/users/me").status_code == 401
    assert c.post("/api/v1/auth/reset-password", json=payload).status_code == 400
    assert login(c, "reset@example.org", PASSWORD).status_code == 401
    assert login(c, "reset@example.org", changed).status_code == 200


def test_independent_sessions_role_revocation_and_suspension(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    assert register(admin, "teacher@example.org").status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        teacher = db.query(User).filter_by(email="teacher@example.org").one()
        teacher_id = teacher.id
    grant = admin.post(f"/api/v1/admin/users/{teacher_id}/roles", json={"role": "instructor", "reason": "Approved staff"})
    assert grant.status_code == 200, grant.text
    with TestClient(app) as first, TestClient(app) as second:
        first.headers.update(ORIGIN)
        second.headers.update(ORIGIN)
        assert login(first, "teacher@example.org").status_code == 200
        assert login(second, "teacher@example.org").status_code == 200
        assert first.post("/api/v1/auth/active-role", json={"role": "instructor"}).status_code == 200
        assert first.get("/api/v1/users/me").json()["active_role"] == "instructor"
        assert second.get("/api/v1/users/me").json()["active_role"] == "student"
        revoked = admin.request("DELETE", f"/api/v1/admin/users/{teacher_id}/roles/instructor", json={"reason": "Assignment ended"})
        assert revoked.status_code == 200, revoked.text
        assert first.get("/api/v1/users/me").status_code == 401
        assert second.get("/api/v1/users/me").status_code == 401
        assert login(first, "teacher@example.org").status_code == 200
        assert first.post("/api/v1/auth/active-role", json={"role": "instructor"}).status_code == 403
        assert admin.post(f"/api/v1/admin/users/{teacher_id}/suspend", json={"reason": "Account review"}).status_code == 200
        assert first.get("/api/v1/users/me").status_code == 401


def test_manager_boundaries_instructor_approval_and_last_admin(client, tmp_path):
    admin, dbmaker = client
    admin_id = admin_ready(admin, dbmaker)
    with dbmaker() as db, pytest.raises(ValueError, match="already completed"):
        bootstrap_admin(db, email="another-admin@example.org", full_name="Another Administrator", password=PASSWORD)
    assert admin.post(f"/api/v1/admin/users/{admin_id}/suspend", json={"reason": "Test protection"}).status_code == 409
    assert admin.request("DELETE", f"/api/v1/admin/users/{admin_id}/roles/administrator",
        json={"reason":"Test protection"}).status_code == 409
    assert register(admin, "manager@example.org", instructor=True).status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        manager = db.query(User).filter_by(email="manager@example.org").one()
        manager_id = manager.id
        own_application = db.query(InstructorRequest).filter_by(user_id=manager_id).one().id
    assert admin.post(f"/api/v1/admin/users/{manager_id}/roles", json={"role":"manager", "reason":"Staff assignment"}).status_code == 200
    with TestClient(app) as manager_client:
        manager_client.headers.update(ORIGIN)
        assert login(manager_client, "manager@example.org").status_code == 200
        assert manager_client.post("/api/v1/auth/active-role", json={"role":"manager"}).status_code == 200
        assert manager_client.post(f"/api/v1/admin/instructor-applications/{own_application}/approve", json={"reason":"Self approval"}).status_code == 403
        assert manager_client.post(f"/api/v1/admin/users/{admin_id}/roles", json={"role":"student", "reason":"Forbidden"}).status_code == 403
        assert manager_client.post(f"/api/v1/admin/users/{manager_id}/roles", json={"role":"administrator", "reason":"Forbidden"}).status_code == 403
        assert register(manager_client, "applicant@example.org", instructor=True).status_code == 202
        assert verify_email(manager_client, tmp_path / "mail").status_code == 200
        with dbmaker() as db:
            applicant = db.query(User).filter_by(email="applicant@example.org").one()
            application = db.query(InstructorRequest).filter_by(user_id=applicant.id).one()
            applicant_id, application_id = applicant.id, application.id
        assert manager_client.post(f"/api/v1/admin/users/{applicant_id}/roles", json={"role":"manager", "reason":"Forbidden grant"}).status_code == 403
        with dbmaker() as db:
            session = db.query(Session).filter_by(user_id=manager_id, revoked=False).one()
            session.authenticated_at = now() - timedelta(minutes=6)
            db.commit()
        assert manager_client.post(f"/api/v1/admin/instructor-applications/{application_id}/approve", json={"reason":"Too old"}).status_code == 403
        assert manager_client.post("/api/v1/auth/reauthenticate", json={"password":PASSWORD}).status_code == 200
        approved = manager_client.post(f"/api/v1/admin/instructor-applications/{application_id}/approve", json={"reason":"Credentials checked"})
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"
        with dbmaker() as db:
            assert Role.instructor in {entry.role for entry in db.get(User, applicant_id).roles}


def test_csrf_rate_limit_and_mfa_admin_guard(client):
    c, dbmaker = client
    admin_ready(c, dbmaker)
    missing = c.patch("/api/v1/users/me", json={"full_name":"Cross Site"}, headers={"Origin":""})
    assert missing.status_code == 403
    cross = c.patch("/api/v1/users/me", json={"full_name":"Cross Site"}, headers={"Origin":"https://evil.example"})
    assert cross.status_code == 403
    c.post("/api/v1/auth/logout")
    for _ in range(8):
        assert login(c, "unknown@example.org").status_code == 401
    assert login(c, "unknown@example.org").status_code == 429
    assert login(c, "admin@example.org").status_code == 200
    assert c.get("/api/v1/admin/users").status_code == 403
    assert c.post("/api/v1/auth/active-role", json={"role":"administrator"}).status_code == 403


def test_profile_email_password_and_session_management(client, tmp_path):
    c, dbmaker = client
    assert register(c, "profile@example.org").status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    assert login(c, "profile@example.org").status_code == 200
    with TestClient(app) as second:
        second.headers.update(ORIGIN)
        assert login(second, "profile@example.org").status_code == 200
        sessions = c.get("/api/v1/users/me/sessions")
        assert sessions.status_code == 200
        assert len(sessions.json()) == 2
        other = next(item for item in sessions.json() if not item["current"])
        assert c.delete(f"/api/v1/users/me/sessions/{other['id']}").status_code == 204
        assert second.get("/api/v1/users/me").status_code == 401
    response = c.post("/api/v1/users/me/email", json={"new_email":"new-profile@example.org", "password":PASSWORD})
    assert response.status_code == 200
    assert verify_email(c, tmp_path / "mail").status_code == 200
    assert c.get("/api/v1/users/me").status_code == 401
    assert login(c, "new-profile@example.org").status_code == 200
    new_password = "Marble-River-Forest-96!"
    changed = c.post("/api/v1/users/me/password", json={"current_password":PASSWORD,
        "new_password":new_password,"new_password_confirmation":new_password})
    assert changed.status_code == 204, changed.text
    assert c.get("/api/v1/users/me").status_code == 401
    assert login(c, "new-profile@example.org", new_password).status_code == 200
    assert c.post("/api/v1/auth/logout-all").status_code == 204
    assert c.get("/api/v1/users/me").status_code == 401


def test_registration_validation_and_mfa_recovery_code(client):
    c, dbmaker = client
    mismatch = c.post("/api/v1/auth/register", json={"full_name":"Synthetic Learner",
        "email":"bad@example.org","password":PASSWORD,"password_confirmation":"different"})
    assert mismatch.status_code == 422
    weak = c.post("/api/v1/auth/register", json={"full_name":"Synthetic Learner",
        "email":"bad@example.org","password":"passwordpassword","password_confirmation":"passwordpassword"})
    assert weak.status_code == 422
    with dbmaker() as db:
        bootstrap_admin(db, email="admin@example.org", full_name="Synthetic Administrator", password=PASSWORD)
    assert login(c, "admin@example.org").status_code == 200
    secret = c.post("/api/v1/auth/mfa/enroll", json={"password": PASSWORD}).json()["secret"]
    recovery = c.post("/api/v1/auth/mfa/confirm", json={"code":pyotp.TOTP(secret).now()}).json()["recovery_codes"][0]
    stepped = c.post("/api/v1/auth/reauthenticate", json={"password":PASSWORD,"mfa_code":recovery})
    assert stepped.status_code == 200, stepped.text
    assert c.post("/api/v1/auth/active-role", json={"role":"administrator"}).status_code == 200
    assert c.post("/api/v1/auth/reauthenticate", json={"password":PASSWORD,"mfa_code":recovery}).status_code == 401
    assert c.get("/api/v1/admin/users").status_code == 200


def test_student_cannot_manage_accounts_and_privileged_grant_needs_verified_email(client):
    c, dbmaker = client
    assert register(c, "student-only@example.org").status_code == 202
    assert login(c, "student-only@example.org").status_code == 200
    assert c.get("/api/v1/admin/users").status_code == 403
    assert c.post("/api/v1/admin/instructor-applications/missing/approve",
        json={"reason":"Forbidden"}).status_code == 403
    c.post("/api/v1/auth/logout")
    admin_ready(c, dbmaker)
    with dbmaker() as db:
        student = db.query(User).filter_by(email="student-only@example.org").one()
    assert c.post(f"/api/v1/admin/users/{student.id}/roles",
        json={"role":"manager", "reason":"Unverified account"}).status_code == 409


def test_instructor_rejection_history_and_account_reactivation(client, tmp_path):
    c, dbmaker = client
    admin_ready(c, dbmaker)
    assert register(c, "rejected@example.org", instructor=True).status_code == 202
    assert verify_email(c, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        applicant = db.query(User).filter_by(email="rejected@example.org").one()
        application_id = db.query(InstructorRequest).filter_by(user_id=applicant.id).one().id
        applicant_id = applicant.id
    rejected = c.post(f"/api/v1/admin/instructor-applications/{application_id}/reject",
        json={"reason":"Requirements not met"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["decided_at"] is not None
    assert c.post(f"/api/v1/admin/instructor-applications/{application_id}/approve",
        json={"reason":"Second decision"}).status_code == 409
    history = c.get("/api/v1/admin/instructor-applications", params={"status":"rejected"})
    assert history.status_code == 200
    assert any(item["id"] == application_id for item in history.json())
    assert c.post(f"/api/v1/admin/users/{applicant_id}/suspend",
        json={"reason":"Account review"}).status_code == 200
    with TestClient(app) as applicant_client:
        applicant_client.headers.update(ORIGIN)
        assert login(applicant_client, "rejected@example.org").status_code == 401
        assert c.post(f"/api/v1/admin/users/{applicant_id}/reactivate",
            json={"reason":"Review completed"}).status_code == 200
        assert login(applicant_client, "rejected@example.org").status_code == 200


def test_manager_mfa_policy_blocks_activation_until_enrollment(client, tmp_path, monkeypatch):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    assert register(admin, "mfa-manager@example.org").status_code == 202
    assert verify_email(admin, tmp_path / "mail").status_code == 200
    with dbmaker() as db:
        manager_id = db.query(User).filter_by(email="mfa-manager@example.org").one().id
    assert admin.post(f"/api/v1/admin/users/{manager_id}/roles",
        json={"role":"manager", "reason":"Manager appointment"}).status_code == 200
    monkeypatch.setenv("MANAGER_MFA_REQUIRED", "true")
    with TestClient(app) as manager:
        manager.headers.update(ORIGIN)
        assert login(manager, "mfa-manager@example.org").status_code == 200
        assert manager.post("/api/v1/auth/active-role", json={"role":"manager"}).status_code == 403
        enrollment = manager.post("/api/v1/auth/mfa/enroll", json={"password": PASSWORD})
        assert enrollment.status_code == 200
        code = pyotp.TOTP(enrollment.json()["secret"]).now()
        assert manager.post("/api/v1/auth/mfa/confirm", json={"code":code}).status_code == 200
        assert manager.post("/api/v1/auth/active-role", json={"role":"manager"}).status_code == 200
