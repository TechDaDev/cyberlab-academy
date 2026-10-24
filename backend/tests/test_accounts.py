from app.models import InstructorRequest, User, UserRole, Role

def signup(c, email="student@example.org", instructor=False):
    return c.post("/api/v1/auth/register", json={
        "full_name": "Test Student",
        "email": email, "password": "very_secure_password_123!",
        "password_confirmation": "very_secure_password_123!",
        "instructor_application": instructor,
    })

def test_registration_and_duplicate(client):
    c, dbmaker = client
    response = signup(c)
    assert response.status_code == 202, response.text
    assert signup(c).status_code == 202
    with dbmaker() as db:
        user = db.query(User).filter_by(email="student@example.org").one()
        assert [role.role for role in user.roles] == [Role.student]
        assert user.email_verified is False
        assert db.query(User).count() == 1

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
    assert response.status_code == 202
    with dbmaker() as db:
        user = db.query(User).filter_by(email="student@example.org").one()
        assert [role.role for role in user.roles] == [Role.student]
        request = db.query(InstructorRequest).filter_by(user_id=user.id).one()
        assert request.status == "pending"

def test_cross_site_profile_change_blocked(client):
    c, _ = client
    signup(c)
    c.post("/api/v1/auth/login", json={"email": "student@example.org", "password": "very_secure_password_123!"})
    response = c.patch("/api/v1/users/me", json={"full_name": "Intruder"}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
