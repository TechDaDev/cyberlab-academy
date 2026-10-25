# Local Execution Report — Milestone 01A

**Date:** 2026-10-24 (Asia/Baghdad)  
**Scope:** Backend authentication execution and local verification only. No frontend work or Module 01 laboratories were started.

## Environment

| Item | Verified value |
|---|---|
| OS | Ubuntu 24.04.5 LTS (Noble) |
| Python / pip | Python 3.12.3; pip 24.0 |
| Git | 2.43.0 |
| Docker / Compose | Docker 29.9.2; Compose 5.4.0 |
| Branch | `codex/milestone-01a-auth` tracking `origin/codex/milestone-01a-auth` |
| Backend database | SQLite at `backend/cyberlab-dev.sqlite3` for the primary local server |
| PostgreSQL verification | PostgreSQL 17 Alpine via Compose on `127.0.0.1:5433`; separate named volume `cyberlab_academy_pg_verify2` |

The requested project directory initially contained only `.qodo` and was not a Git checkout. The remote branch was cloned to a temporary directory and its tracked files were placed into the requested directory while preserving `.qodo`. `git fetch origin` completed; the checkout was clean before these changes.

A development-only PostgreSQL password was generated into `/tmp/cyberlab-dev.env` with mode `0600`. It is outside the repository and was not committed. The default Compose mapping to port 5432 could not start because an existing local listener already owned that port. That listener was left untouched; the verification container uses port 5433. Port 8001 was also already occupied and was left untouched.

## Installed dependencies

Installed from `backend/pyproject.toml` into `backend/.venv` using `pip install -e '.[test]'`. Import checks passed for:

- FastAPI 0.162.0 and Uvicorn 0.54.0
- SQLAlchemy 2.1.6 and Alembic 1.20.1
- Pydantic 2.14.1 and pydantic-settings 2.16.1
- psycopg 3.3.6 (binary driver)
- pwdlib 0.3.1 with Argon2 support
- pytest 9.1.1 and httpx 0.28.1

## Execution and database

Commands run from the repository/backend directories included:

```sh
git fetch origin
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
DATABASE_URL=sqlite:///./cyberlab-dev.sqlite3 .venv/bin/alembic upgrade head
.venv/bin/pytest -q
COOKIE_SECURE=false DATABASE_URL=sqlite:///./cyberlab-dev.sqlite3 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

SQLite migration completed at revision `0001_accounts`. PostgreSQL migration completed at the same revision. The five application tables exist in both databases: `users`, `user_roles`, `sessions`, `instructor_requests`, and `audit_events` (plus Alembic's `alembic_version`). `alembic check` reported no new upgrade operations against either database, so the migrated schemas match the current SQLAlchemy metadata.

Compose was run with `infrastructure/compose.yml` and a temporary override changing the host port to 5433. PostgreSQL stayed bound to loopback. The PostgreSQL-backed API was temporarily run on `127.0.0.1:8002` for HTTP checks and was stopped after verification. The primary SQLite-backed Uvicorn reload server remains running on `127.0.0.1:8000`.

## Application verification

**Primary local URL:** http://127.0.0.1:8000  
**Health:** http://127.0.0.1:8000/api/v1/health → `{"status":"ok"}`  
**Swagger UI:** http://127.0.0.1:8000/docs  
**OpenAPI:** http://127.0.0.1:8000/openapi.json

The server started without import or startup errors. Health, Swagger, OpenAPI, and account endpoint schemas loaded successfully. All requests were made over loopback only.

## Testing

- Automated backend suite: **5 passed, 0 failed** (`pytest -q`). One Starlette deprecation warning notes that `httpx` support through `starlette.testclient` is deprecated.
- SQLite HTTP workflow: **18 checks passed**. Verified health/docs/OpenAPI, student registration/default role, duplicate rejection, Argon2 hash storage and verification, registration audit event, login cookie/session and audit persistence, profile retrieval/update, unassigned role rejection (403), cross-site mutation rejection (403), unavailable admin route, logout (204), revoked-session rejection (401), and pending instructor request without instructor role.
- PostgreSQL HTTP and persistence workflow: **19 checks passed** across the same account/session/profile/security behavior plus DB-backed Argon2 verification, session and audit persistence, and pending instructor status with student-only role.
- Regression coverage added: the instructor-application test now asserts that an `InstructorRequest` row is persisted with `pending` status.

## Security review

### Implemented and verified

- Argon2 password hashing; the stored value is a hash and verifies successfully.
- Random opaque session cookie; only its SHA-256 digest is stored in the database.
- Session expiry is 12 hours; logout revokes the session and deletes the cookie.
- Cookie is `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` defaults to true. Local HTTP verification explicitly used `COOKIE_SECURE=false`.
- Registration grants only `student`; instructor applications create pending requests and do not grant instructor privileges.
- Role switching requires an assigned role. Administrator switching returns 403 until step-up authentication exists.
- Login failure uses a generic invalid-credentials response. Registration and login audit rows persisted in both databases.
- Cross-site `Origin` requests and `Sec-Fetch-Site: cross-site` mutations are rejected by the current basic protection.

### Known weaknesses / not production-ready

- `active_role` is stored on the user row, not on the authenticated session. A role switch in one session changes the account-wide active role observed by other sessions. This requires a session-scoped role model and migration before concurrent multi-role sessions are safe.
- CSRF checks allow state-changing requests when both `Origin` and `Sec-Fetch-Site` are absent. Strict origin validation or a token-based design and trusted-proxy policy are still needed.
- Registration returns 409 for duplicate email, which permits email enumeration. Authentication endpoints have no rate limiting or abuse controls.
- Email verification and password recovery are absent. Registration currently permits login before email verification.
- Instructor approval, invitation, privileged role assignment, administrator bootstrap, MFA/step-up, and last-administrator protections are not implemented. There are no administrative API routes yet.
- Resource-level authorization, session revocation policy, concurrency guarantees, and robust security-event failure handling need broader implementation and tests before production.

**Readiness:** Local development and the current milestone increment are operational. This is **not production-ready**.

## Git

- Branch: `codex/milestone-01a-auth`
- Verified code/test commit: `c12e610b4c53cca83711abd28c4dce3c0c10fbb4` (`test(auth): verify pending instructor request`)
- Files in that commit: `.gitignore`, `backend/tests/test_accounts.py`
- Report file is committed separately after the verified code/test commit.
- Push status: not pushed. The branch is ahead of origin; no push or merge was performed.

`.gitignore` now excludes local SQLite files, editable-install metadata, and the generated code graph artifact. The local SQLite database remains available for development and contains only synthetic verification accounts.

## Remaining work before frontend integration

1. Move active role into the session model and migrate/test independent concurrent sessions.
2. Add email verification and gate assessed use appropriately.
3. Implement password recovery with expiring, single-use tokens and session revocation.
4. Implement instructor invitation/application approval and audited privileged role assignment.
5. Add secure administrator bootstrap, MFA/step-up, and last-administrator protections.
6. Add rate limits, abuse monitoring, and reduce account enumeration.
7. Complete CSRF and proxy/origin configuration for deployment.
8. Add account disablement, session management/revocation policy, and concurrency-safe authorization.
9. Expand authorization and audit failure-path tests; review against OWASP ASVS.
10. Publish and stabilize the API contract before Arena AI frontend integration.
