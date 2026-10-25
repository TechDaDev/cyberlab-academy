# Milestone 01A: authentication increment

## Implemented in first increment
- Student signup; optional instructor application creates pending request but grants only student role.
- Argon2 password hashing via pwdlib.
- Opaque random server-side session cookies (SHA-256 digest stored in DB).
- Login, logout, current-user, profile-name update, assigned-role switching for non-admin roles.
- Data models and initial Alembic migration for users, roles, sessions, instructor requests and audit events.
- Basic origin / Fetch Metadata protection on cookie-authenticated mutations.

## NOT PRODUCTION READY
- Email verification, recovery, invitation/approval, privileged role assignment, administrator bootstrap and MFA are not built.
- Role switching to Administrator is deliberately blocked until step-up MFA exists.
- Login and registration need robust rate limits and anti-enumeration controls.
- CSRF requires a complete production model (strict origin enforcement / tokens + proxy configuration) before release.
- Session and role changes should gain revocation policy, concurrency safety and reliable security event logging.
- Complete tests, then harden all flows and review against OWASP ASVS before production.
- Use COOKIE_SECURE=true behind HTTPS; tests set it false for localhost.
- Local SQLite default is for development only. Set DATABASE_URL for PostgreSQL and run Alembic upgrade head.

## Development
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
alembic upgrade head
pytest -q
uvicorn app.main:app --reload
