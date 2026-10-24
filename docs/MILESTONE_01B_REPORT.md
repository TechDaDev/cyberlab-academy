# Milestone 01B Report — Accounts, Roles, and Administration

**Date:** 2026-10-24
**Branch:** `codex/milestone-01b-accounts` (stacked on `codex/milestone-01a-auth`)
**Pull request:** [#3](https://github.com/TechDaDev/cyberlab-academy/pull/3) into `codex/milestone-01a-auth`
**Scope:** Backend account and authorization work only. No frontend components were created.

## 1. Features implemented

### Session-scoped roles and sessions
- Active role lives on `sessions.active_role`; the `users.active_role` column was removed.
- Every protected request re-checks that the session role is still assigned to the account.
- Role switching rotates the cookie and affects only the calling session.
- Revoking a role or suspending an account revokes affected sessions.
- Role switch, grant, revocation, suspension, reactivation, login, logout, recovery, and MFA events are audited.

### Registration and email verification
- Full name, email, password, and password confirmation with server-side matching and strength checks.
- Email normalization (`strip` + `casefold`) and a unique constraint; duplicate registration returns the same generic `202`.
- Optional instructor application creates a `pending` record and grants only Student.
- Verification tokens are 32-byte URL-safe values; only SHA-256 digests are stored.
- Tokens expire after 60 minutes, are claimed atomically, and work once.
- Resend invalidates earlier unused verification tokens and is rate limited.
- Dev mail capture writes mode-0700 directory and mode-0600 JSON files outside the repo; no HTTP route exposes them.
- SMTP delivery is available through environment configuration; production rejects the capture provider.

### Password recovery and account security
- Forgot-password, reset-password, change-password, and verified email change.
- Reset tokens expire after 30 minutes and are single use.
- Successful reset or password change revokes every session for the account.
- Forgot-password and resend responses are identical for existing and absent addresses.
- Account-wide and address-scoped rate limits for login, registration, resend, recovery, and enrollment.

### Instructor approval
- Manager/Administrator list, approve, reject, and filter applications.
- Approval requires a verified, active applicant and grants Instructor.
- A reviewer cannot decide their own application.
- Decisions persist status, actor, UTC time, and reason.

### Role hierarchy and administration
- Student, Instructor, Manager, Administrator.
- Managers can manage Student and Instructor accounts only; privileged accounts and roles are hidden and rejected.
- Administrators can manage all roles, subject to last-Administrator protection.
- Administrator-only role assignment requires recent authentication and recent MFA.
- Secure bootstrap CLI creates the first Administrator with a hidden password prompt and requires `MFA_ENCRYPTION_KEY`.
- Bootstrap cannot repeat after any Administrator has been created, including after that Administrator is later removed.
- Last active Administrator cannot be suspended or lose the Administrator role; PostgreSQL serializes concurrent attempts.

### MFA and step-up
- TOTP enrollment requires the current password and a login within five minutes.
- Secrets are Fernet-encrypted with `MFA_ENCRYPTION_KEY`; eight recovery codes are stored as SHA-256 digests and shown once.
- Confirming enrollment rotates the cookie and revokes other sessions.
- Administrator access requires an enabled factor and a verified session; sensitive Administrator operations require MFA within five minutes.
- Managers may enroll voluntarily; `MANAGER_MFA_REQUIRED=true` enforces it for Manager activation.
- TOTP counters prevent code replay; recovery codes are one time.

### Hardening
- Strict `Origin` validation and `Sec-Fetch-Site: cross-site` rejection on cookie-authenticated mutations.
- `TrustedHostMiddleware`, configurable allowed hosts, and explicit trusted-proxy configuration in `app.run`.
- `no-store` and `no-referrer` headers on account and administration routes.
- `HttpOnly`, `SameSite=Lax`, `Secure`-by-default session cookie; 12-hour server-side expiry.
- Atomic one-time-token claims; unique constraints and conflict handling for concurrent duplicates.
- Object-level checks on session revocation, profile operations, and administration targets.
- Responses never include password hashes, MFA secrets, session tokens, or recovery tokens.

## 2. Features incomplete

- Formally assessed mission endpoints do not exist yet; `require_verified_email` is implemented and documented for that future gating.
- Manager/Administrator invitations are not implemented; privileged roles are assigned by an existing Administrator.
- MFA cannot be disabled, re-enrolled after enablement, or have recovery codes regenerated through the API.
- Rate-limit event rows are not pruned automatically; a retention job is future operations work.
- Expired sessions are rejected but not garbage-collected.
- Mail delivery is in-process background work, not a durable outbox; a crash can drop a message.
- No independent penetration test or OWASP ASVS assessment has been performed.

## 3. Database migrations

`backend/alembic/versions/0002_account_security.py`:

- Adds `sessions.active_role`, `authenticated_at`, `mfa_verified_at`, and `created_at`; backfills from the old user role and makes them non-null.
- Removes `users.active_role`.
- Adds instructor decision fields.
- Creates `one_time_tokens`, `mfa_enrollments`, `mfa_recovery_codes`, and `rate_limit_events` with indexes.

Verified on SQLite and PostgreSQL 17:

```sh
alembic upgrade head
alembic check            # no new upgrade operations
alembic downgrade 0001_accounts
alembic upgrade head
alembic current          # 0002_account_security (head)
```

No schema change was required for the final security fixes.

## 4. API endpoints

Base path `/api/v1`. The authoritative contract is [`shared-contracts/openapi.json`](../shared-contracts/openapi.json); frontend guidance is in [`docs/ARENA_FRONTEND_API_GUIDE.md`](ARENA_FRONTEND_API_GUIDE.md).

| Method | Path | Access |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/verification/resend` | Public |
| POST | `/auth/verify-email` | Public (token) |
| POST | `/auth/login` | Public |
| POST | `/auth/forgot-password` | Public |
| POST | `/auth/reset-password` | Public (token) |
| POST | `/auth/logout` | Cookie session |
| POST | `/auth/logout-all` | Authenticated |
| POST | `/auth/reauthenticate` | Authenticated |
| POST | `/auth/active-role` | Authenticated |
| POST | `/auth/mfa/enroll` | Authenticated, recent login, password |
| POST | `/auth/mfa/confirm` | Authenticated |
| GET | `/users/me` | Authenticated |
| PATCH | `/users/me` | Authenticated |
| GET | `/users/me/roles` | Authenticated |
| POST | `/users/me/password` | Authenticated |
| POST | `/users/me/email` | Authenticated |
| GET | `/users/me/sessions` | Authenticated |
| DELETE | `/users/me/sessions/{session_id}` | Authenticated owner |
| GET | `/admin/users` | Manager/Administrator |
| POST | `/admin/users/{user_id}/suspend` | Manager/Administrator |
| POST | `/admin/users/{user_id}/reactivate` | Manager/Administrator |
| POST | `/admin/users/{user_id}/roles` | Manager/Administrator |
| DELETE | `/admin/users/{user_id}/roles/{role}` | Manager/Administrator |
| GET | `/admin/instructor-applications` | Manager/Administrator |
| POST | `/admin/instructor-applications/{application_id}/approve` | Manager/Administrator |
| POST | `/admin/instructor-applications/{application_id}/reject` | Manager/Administrator |
| GET | `/health` | Public |

## 5. Automated test results

Environment: Python 3.12.3, FastAPI 0.162.0, SQLAlchemy 2.1.6, Alembic 1.20.1, Pydantic 2.14.1.

| Command | Database | Result |
|---|---|---|
| `.venv/bin/python -m pytest -q` | In-memory SQLite | **25 passed, 3 skipped** (PostgreSQL tests skip) |
| `CYBERLAB_TEST_POSTGRES_URL=... pytest -q` | SQLite plus temporary PostgreSQL databases | **28 passed, 0 failed, 0 skipped** |

Test files:

- `tests/test_health.py`, `tests/test_run.py` — app and runner configuration.
- `tests/test_accounts.py` — registration, login, profile, logout, cross-site block.
- `tests/test_milestone_01b.py` — verification expiry/replacement, reset reuse and session revocation, session isolation and role revocation, suspension, Manager boundaries, self-approval, last Administrator, CSRF and brute-force limits, profile/email/password/session management, registration validation, recovery codes, unverified privileged grants, rejection history, Manager MFA policy.
- `tests/test_milestone_01b_hardening.py` — duplicate/normalized registration, hashed tokens, Instructor self-approval, Manager privilege boundaries, repeat bootstrap, email-change non-disclosure, encrypted MFA secrets and hashed recovery codes, private mail capture, account-wide rate limit.
- `tests/test_postgres_integration.py` — migration round-trip, session isolation, concurrent single-use token claim, concurrent last-Administrator protection.

Covered critical scenarios include: Student Manager operations, Manager Administrator operations, Manager creating another Manager, Instructor self-approval, unauthorized role activation, independent sessions with different roles, role revocation during a session, suspended-account requests, expired verification token, reused reset token, session revocation after reset, Administrator MFA enforcement, last-Administrator protection, concurrent privileged removal, CSRF attempts, and brute-force limits.

Manual HTTP checks (reported separately, not counted as automated tests):

- `GET /api/v1/health` → 200 `{"status":"ok"}`.
- `GET /docs` → 200; `GET /openapi.json` → 200 and byte-equivalent to the committed contract.
- Unauthenticated `POST /auth/mfa/enroll` with valid JSON → 401.

## 6. PostgreSQL results

- PostgreSQL 17 on `127.0.0.1:5433`.
- Alembic upgrade, downgrade to `0001_accounts`, and upgrade to head succeeded; `alembic check` reported no pending operations.
- Full HTTP workflow tests passed against temporary per-test databases, including concurrent token consumption and concurrent Administrator suspension.
- Advisory locks (`pg_advisory_xact_lock`) serialize last-Administrator checks and rate-limit accounting.

## 7. Security review

Internal review of the 01B diff produced two findings; both were fixed and covered by tests.

1. **HIGH — MFA enrollment without reauthentication.** A session created from a password login, or a stolen cookie, could enroll a new authenticator and then activate Administrator. Fix: enrollment now requires the current password, a login within five minutes, and rate limiting; confirmation revokes every other session; the request body is documented and in the contract.
2. **MEDIUM — account enumeration through delivery timing.** Verification and recovery mail was sent synchronously only for existing accounts. Fix: delivery is scheduled as a background task after the response.

Remaining residual risks:

- CSRF relies on strict `Origin` plus Fetch Metadata, not anti-CSRF tokens. This is appropriate for a JSON API using `SameSite=Lax` cookies and exact origins, but must keep `ALLOWED_ORIGINS` correct behind TLS termination.
- SMTP behavior was unit-configured but not exercised against a live mail server during this milestone.
- One Administrator bootstrap window remains: between creation and MFA enrollment the account has the Administrator role but cannot use Administrator endpoints. It can enroll only with the password.
- No independent third-party security assessment has been performed.

**This milestone is not declared production-ready.**

## 8. Known limitations

- No class, mission, assessment, or teaching-resource endpoints exist, so object-level authorization beyond account objects is not yet exercised.
- SQLite is for development and tests; PostgreSQL is the supported deployment database.
- Rate limiting is database-backed and per process-safe but not distributed beyond shared database rows.
- Background mail delivery is best effort within the API process.
- Frontend must implement `/verify-email` and `/reset-password` pages that submit link tokens to the API.

## 9. Git

- Base: `codex/milestone-01a-auth` at `952990b`
- `7d19abe` — feat(auth): complete session accounts and privileged workflows
- `62c1d0d` — docs(auth): publish contract and harden account controls
- `9f9c3cc` — fix(auth): harden token claims, rate limits, and bootstrap guard
- `bf3e9e5` — fix(auth): require password reauthentication for MFA enrollment
- Report commit: this file's commit on `codex/milestone-01b-accounts`
- Pull request: [#3](https://github.com/TechDaDev/cyberlab-academy/pull/3), open and not merged
- Branch pushed to `origin/codex/milestone-01b-accounts`

## 10. Readiness for Arena AI frontend integration

**Ready for account UI integration.** The account contract is stable enough for authentication screens and role-based dashboards:

- Registration, verification, login, logout, recovery, profile, session management, and MFA flows are documented with request bodies, responses, errors, and permissions.
- The authentication state machine and session-scoped role switching are explicit in [`docs/ARENA_FRONTEND_API_GUIDE.md`](ARENA_FRONTEND_API_GUIDE.md).
- Administrator screens can rely on the documented Manager boundaries, step-up requirements, and `409` last-Administrator behavior.

**Not ready for production deployment or assessed-mission UI.** Mission, class, grading, and assessment APIs do not exist yet, and deployment security (HTTPS, SMTP, proxy, monitoring, independent review) remains outstanding.
</file_text>
