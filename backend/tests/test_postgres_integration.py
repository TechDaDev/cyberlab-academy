"""PostgreSQL migration, session isolation, and concurrent admin safety checks.

Set CYBERLAB_TEST_POSTGRES_URL to an authorized local PostgreSQL URL. Each test
creates and removes its own uniquely named temporary database.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pyotp
import pytest
from cryptography.fernet import Fernet
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.bootstrap_admin import bootstrap_admin
from app.database import get_db
from app.main import app
from app.models import Role, User, UserRole
from test_milestone_01b import ORIGIN, PASSWORD, latest_token, login, register


@pytest.fixture
def postgres_client(monkeypatch, tmp_path):
    raw = os.getenv("CYBERLAB_TEST_POSTGRES_URL")
    if not raw:
        pytest.skip("CYBERLAB_TEST_POSTGRES_URL not configured")
    base_url = make_url(raw)
    name = "cyberlab_test_" + uuid4().hex[:12]
    admin_engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as connection:
        connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
    test_url = base_url.set(database=name)
    monkeypatch.setenv("DATABASE_URL", test_url.render_as_string(hide_password=False))
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("MFA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("MAIL_CAPTURE_DIR", str(tmp_path / "mail"))
    configuration = Config("alembic.ini")
    command.upgrade(configuration, "head")
    engine = create_engine(test_url)
    local = sessionmaker(bind=engine, expire_on_commit=False)
    def override():
        with local() as session:
            yield session
    app.dependency_overrides[get_db] = override
    try:
        with TestClient(app) as c:
            c.headers.update(ORIGIN)
            yield c, local, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
        with admin_engine.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{name}"')
        admin_engine.dispose()


def admin_ready(c, dbmaker):
    with dbmaker() as db:
        bootstrap_admin(db, email="pg-admin@example.org", full_name="Postgres Administrator", password=PASSWORD)
    assert login(c, "pg-admin@example.org").status_code == 200
    enrollment = c.post("/api/v1/auth/mfa/enroll")
    assert enrollment.status_code == 200, enrollment.text
    assert c.post("/api/v1/auth/mfa/confirm", json={"code":pyotp.TOTP(enrollment.json()["secret"]).now()}).status_code == 200
    assert c.post("/api/v1/auth/active-role", json={"role":"administrator"}).status_code == 200
    return c.get("/api/v1/users/me").json()["id"]


def test_postgres_migration_and_independent_sessions(postgres_client, tmp_path):
    c, dbmaker, engine = postgres_client
    assert {"users", "user_roles", "sessions", "one_time_tokens", "mfa_enrollments"}.issubset(set(inspect(engine).get_table_names()))
    admin_ready(c, dbmaker)
    assert register(c, "pg-teacher@example.org").status_code == 202
    token = latest_token(tmp_path / "mail")
    assert c.post("/api/v1/auth/verify-email", json={"token":token}).status_code == 200
    with dbmaker() as db:
        teacher = db.scalar(select(User).where(User.email == "pg-teacher@example.org"))
        teacher_id = teacher.id
    assert c.post(f"/api/v1/admin/users/{teacher_id}/roles", json={"role":"instructor", "reason":"Academic role"}).status_code == 200
    with TestClient(app) as first, TestClient(app) as second:
        first.headers.update(ORIGIN)
        second.headers.update(ORIGIN)
        assert login(first, "pg-teacher@example.org").status_code == 200
        assert login(second, "pg-teacher@example.org").status_code == 200
        assert first.post("/api/v1/auth/active-role", json={"role":"instructor"}).status_code == 200
        assert first.get("/api/v1/users/me").json()["active_role"] == "instructor"
        assert second.get("/api/v1/users/me").json()["active_role"] == "student"
        assert c.request("DELETE", f"/api/v1/admin/users/{teacher_id}/roles/instructor", json={"reason":"Role removed"}).status_code == 200
        assert first.get("/api/v1/users/me").status_code == 401
        assert second.get("/api/v1/users/me").status_code == 401


def test_postgres_concurrent_last_admin_protection(postgres_client, tmp_path):
    first, dbmaker, engine = postgres_client
    first_id = admin_ready(first, dbmaker)
    assert register(first, "pg-second@example.org").status_code == 202
    token = latest_token(tmp_path / "mail")
    assert first.post("/api/v1/auth/verify-email", json={"token":token}).status_code == 200
    with dbmaker() as db:
        second_id = db.scalar(select(User.id).where(User.email == "pg-second@example.org"))
    assert first.post(f"/api/v1/admin/users/{second_id}/roles", json={"role":"administrator", "reason":"Second administrator"}).status_code == 200
    with TestClient(app) as second:
        second.headers.update(ORIGIN)
        assert login(second, "pg-second@example.org").status_code == 200
        enrollment = second.post("/api/v1/auth/mfa/enroll")
        assert enrollment.status_code == 200
        code = pyotp.TOTP(enrollment.json()["secret"]).now()
        assert second.post("/api/v1/auth/mfa/confirm", json={"code":code}).status_code == 200
        assert second.post("/api/v1/auth/active-role", json={"role":"administrator"}).status_code == 200
        def suspend(client, target):
            return client.post(f"/api/v1/admin/users/{target}/suspend", json={"reason":"Concurrent test"}).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            result_one = executor.submit(suspend, first, second_id)
            result_two = executor.submit(suspend, second, first_id)
            statuses = [result_one.result(), result_two.result()]
        assert statuses.count(200) <= 1
        with dbmaker() as db:
            active_admins = db.scalar(select(func.count()).select_from(UserRole).join(User).where(
                UserRole.role == Role.administrator, User.is_active.is_(True)))
            assert active_admins >= 1
