import os
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import InstructorRequest, User, UserRole, Role

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("COOKIE_SECURE", "false")
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    local = sessionmaker(bind=engine, expire_on_commit=False)
    def override():
        with local() as session:
            yield session
    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c, local
    app.dependency_overrides.clear()
    engine.dispose()

def signup(c, email="student@example.org", instructor=False):
    return c.post("/api/v1/auth/register", json={
        "full_name": "Test Student",
        "email": email, "password": "very_secure_password_123!",
        "instructor_application": instructor,
    })

def test_registration_and_duplicate(client):
    c, _ = client
    response = signup(c)
    assert response.status_code == 201, response.text
    assert response.json()["roles"] == ["student"]
    assert response.json()["email_verified"] is False
    assert signup(c).status_code == 409

def test_login_profile_switch_and_logout(client):
    c, _ = client
    signup(c)
    response = c.post("/api/v1/auth/login", json={"email": "student@example.org", "password": "very_secure_password_123!"})
    assert response.status_code == 200, response.text
    assert c.get("/api/v1/users/me").status_code == 200
    assert c.post("/api/v1/auth/active-role", json={"role": "manager"}).status_code == 403
    assert c.patch("/api/v1/users/me", json={"full_name": "Updated Student"}).json()["full_name"] == "Updated Student"
    assert c.post("/api/v1/auth/logout").status_code == 204
    assert c.get("/api/v1/users/me").status_code == 401

def test_instructor_application_does_not_grant_role(client):
    c, dbmaker = client
    response = signup(c, instructor=True)
    assert response.status_code == 201
    assert response.json()["roles"] == ["student"]
    with dbmaker() as db:
        request = db.query(InstructorRequest).filter_by(user_id=response.json()["id"]).one()
        assert request.status == "pending"

def test_cross_site_profile_change_blocked(client):
    c, _ = client
    signup(c)
    c.post("/api/v1/auth/login", json={"email": "student@example.org", "password": "very_secure_password_123!"})
    response = c.patch("/api/v1/users/me", json={"full_name": "Intruder"}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
