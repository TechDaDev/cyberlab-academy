# Milestone 01D — Frontend/Backend Integration Report

- **Date:** 2026-10-24
- **Branch:** `codex/milestone-01d-integration`
- **Base branch:** `feat/01c1-typography-responsive-ci` (`9934f02`)
- **Pull request:** [#7](https://github.com/TechDaDev/cyberlab-academy/pull/7) — open, **not merged**
- **Scope:** local integration of the Milestone 01B FastAPI backend with the Milestone 01C/01C.1 Next.js frontend. No backend behaviour was changed to make the frontend work.

## 1. Outcome

| Completion criterion | Result |
|---|---|
| Frontend and backend run together | ✅ `localhost:3000` → proxy → `127.0.0.1:8000` |
| PostgreSQL persistence works | ✅ isolated database `cyberlab_01d`, migrations at head |
| Registration and login function | ✅ via real browser and API |
| Email verification works | ✅ dev mail capture, single-use token |
| Password recovery works | ✅ reset link, single use, sessions revoked |
| All four role workflows verified | ✅ Student, Instructor, Manager, Administrator |
| Authorization restrictions enforced | ✅ 403/409 verified against FastAPI, not just hidden UI |
| MFA works | ✅ enrolment, TOTP, recovery codes, step-up window |
| Sessions behave correctly | ✅ rotation, revocation, expiry, independence |
| Automated tests pass | ✅ backend 28+31, frontend 47 |
| Browser testing finds no unresolved critical defects | ✅ one cosmetic defect found and fixed |

## 2. Environment

| Item | Verified value |
|---|---|
| OS | Ubuntu 24.04.5 LTS |
| Python | 3.12.3, project venv `backend/.venv` |
| Node / npm | v22.22.1 / 10.9.4 |
| Docker / Compose | 29.9.2 / v5.4.0 |
| PostgreSQL | 17.10 (`postgres:17-alpine`, container `cyberlab-verify-postgres-1`, `127.0.0.1:5433`, healthy) |
| Browser | Google Chrome 156.0.8078.47 (DevTools MCP + headless CDP driver) |
| Backend runtime | FastAPI 0.162.0, SQLAlchemy 2.1.6, Alembic 1.20.1, Pydantic 2.14.1 |
| Frontend runtime | Next.js 16.4.3, React 19.3.1, Tailwind CSS 4.3.3, Vitest 4.1.12 |

Port inventory before starting: `8000` held a stale Milestone 01B **SQLite** dev server (`python -m app.run`, `DATABASE_URL=sqlite:./cyberlab-dev.sqlite3`). It was stopped so the integration backend could own `8000`. Unrelated listeners (`8001`, `3782`, `5432`, `5433`, `6379`, editor/IDE ports) were inspected and left untouched. No database, volume or container was dropped.

## 3. PostgreSQL configuration

- Created the isolated database **`cyberlab_01d`** (owner `cyberlab`) inside the existing cluster; the pre-existing `cyberlab` database was left intact.
- Credentials and secrets live in `/tmp/cyberlab-01d.env` (mode `0600`, untracked, outside the repository). Nothing secret was committed.
- Migrations applied with `alembic upgrade head`:

```
0001_accounts -> 0002_account_security   (head)
alembic check: No new upgrade operations detected.
```

- Schema present: `users`, `user_roles`, `sessions`, `one_time_tokens`, `mfa_enrollments`, `mfa_recovery_codes`, `rate_limit_events`, `instructor_requests`, `audit_events`, `alembic_version`.
- Downgrade/upgrade round-trip is covered by `backend/tests/test_postgres_integration.py`.

Synthetic accounts used (all `@cyberlab.integration`, no real student data):

| Account | Roles | Notes |
|---|---|---|
| `admin@cyberlab.integration` | administrator, student | created through the bootstrap mechanism, MFA enrolled in the browser |
| `student01@cyberlab.integration` | student | registered and verified through the UI |
| `student02@cyberlab.integration` | instructor, student | registered with an Instructor application, approved by the Manager |
| `manager01@cyberlab.integration` | manager, student | appointed by the Administrator |

Final database state: 4 accounts (all verified and active), 1 decided Instructor application, 86 audit events, 26 sessions of which 13 live.

## 4. Backend startup result

```sh
set -a && . /tmp/cyberlab-01d.env && set +a
.venv/bin/python -m app.run        # 127.0.0.1:8000, PostgreSQL cyberlab_01d
```

| Check | Result |
|---|---|
| `GET /api/v1/health` | `200 {"status":"ok"}` |
| `GET /docs` (Swagger UI) | `200` |
| `GET /openapi.json` | `200`, 27 paths |
| Contract parity | running schema is **identical** to `shared-contracts/openapi.json` |
| PostgreSQL connectivity | `PostgreSQL 17.10 on x86_64-pc-linux`, `db=cyberlab_01d host=127.0.0.1 port=5433` |
| Migrations | `alembic current` → `0002_account_security (head)`, `alembic check` clean |

## 5. Frontend startup result

`frontend/.env.local` (gitignored, mode `0600`):

```
CYBERLAB_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_ENABLE_PREVIEW_DEMO=false
```

| Command | Result |
|---|---|
| `npm ci` | pass, lockfile in sync, 0 vulnerabilities |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | **47 passed** (8 files) |
| `npm run build` | pass, 17 routes |
| `npm audit` | **0 vulnerabilities** |
| `npm audit --omit=dev` | **0 vulnerabilities** |
| `npx next start -p 3000` | ready, `/api/v1/health` through the proxy → `200` |

**Demonstration adapter disabled.** With `NEXT_PUBLIC_ENABLE_PREVIEW_DEMO=false` the flag is compiled to a constant `false`. Verified by stopping FastAPI: the UI showed only *"FastAPI Backend Unreachable … Retry FastAPI"* with **no** "Enable Preview Demo Mode" control. Every browser request in this report therefore used the real backend and PostgreSQL. Dashboard telemetry that is not backed by an API yet stays explicitly labelled `DEMO PREVIEW` / "Synthetic Curriculum & Telemetry Preview"; no synthetic row is presented as a real user record.

## 6. Browser integration testing

Two drivers were used: the interactive Chrome DevTools MCP session (desktop) and a dependency-free CDP script (Node 22 `WebSocket`) for repeatable viewport runs at **390×844**, **768×1024** and **1440×900**.

Pages exercised: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password?token=…`, `/verify-email?token=…`, `/dashboard`, `/dashboard/student`, `/dashboard/instructor`, `/dashboard/manager`, `/dashboard/admin`, `/settings/profile`, `/settings/security`, `/settings/sessions`, `/settings/mfa`.

| Check | Result |
|---|---|
| Console errors / React exceptions | none on any page, any role, any viewport |
| Failed API requests | only the expected `401` on `/users/me` for anonymous visitors and after the deliberately expired session |
| Horizontal overflow (`scrollWidth > clientWidth`) | none at 390 / 768 / 1440 |
| Wide data tables | scroll inside `overflow-x-auto` containers (verified `DIV.overflow-x-auto` wrapper), page itself never scrolls sideways |
| Navigation, forms, dialogs, toasts | functional; sidebar collapses to icon rail, mobile drawer toggle present below `md` |
| Authenticated redirects | anonymous `/settings/profile` → `/login?next=%2Fsettings%2Fprofile`; expired session behaves the same |
| Demo mode UI | absent (see §5) |

A screenshot set was captured for the landing page, all auth pages, and all four dashboards at desktop and mobile widths.

## 7. Authentication verification

| Control | Evidence |
|---|---|
| Session cookie | `cyberlab_session=…; HttpOnly; Max-Age=43200; Path=/; SameSite=lax`; `Secure` omitted only because `COOKIE_SECURE=false` for local HTTP |
| Cookie invisibility to JS | `document.cookie` is empty; nothing in `localStorage` / `sessionStorage` |
| Session rotation | cookie value changes on login **and** on every role switch (old value immediately invalid) |
| `Origin` / CSRF | `POST /auth/login` without `Origin` → 403; with `Origin: https://evil.example` → 403; with `Sec-Fetch-Site: cross-site` → 403 |
| Session revocation | logout, `logout-all`, password change, password reset, suspension, role grant/revocation and Instructor approval all invalidate affected sessions (verified `401` afterwards) |
| Session expiry | server-side expiry forced → next protected navigation redirects to `/login?next=…` |
| Rate limiting | 9th failed login for the same address+email → `429`; 4th `forgot-password` → `429`; registration/verification windows behave likewise |
| Enumeration resistance | duplicate registration returns the same `202` message with no second account and no email; forgot-password identical for known and unknown addresses |
| Token security | verification/reset tokens are 32-byte URL-safe values, stored only as SHA-256 digests, single use, 60/30-minute expiry; reuse → `400` |
| Cross-account access | deleting another user's session id → `404`; `GET /admin/users` as Student or Instructor → `403` |

## 8. Student workflow

1. Opened `/register` in the browser and submitted full name, email, password and confirmation.
2. Response: `HTTP 202` — *"If eligible, check your email for verification"* (generic by design).
3. Retrieved the verification link from the development mail capture (`MAIL_CAPTURE_DIR=/tmp/cyberlab-01d-mail`, mode `0600` files, no HTTP route exposes them).
4. Opened `/verify-email?token=…` → **"Email Address Verified"**.
5. Signed in → redirected to `/dashboard/student`, greeting *"Welcome back, Amina Karim"* with `EMAIL VERIFIED` and role `Student`.
6. Viewed `/settings/profile` (account id, email, active session role, member since).
7. Edited the full name → toast *"Profile updated"*; PostgreSQL row updated and an `profile.updated` audit event written.
8. Signed out → redirected to `/login` with *"Signed out"*.

Negative paths in the same session:

| Scenario | Observed behaviour |
|---|---|
| Invalid password | *"Sign-In Failed — Invalid credentials"*, no session created |
| Duplicate registration | same `202` message, `users` table still has one row, no new mail |
| Expired verification token | *"Verification Token Invalid or Expired"* + resend form |
| Resend after expiry | new 60-minute token issued, previous token invalid |
| Session expiration | protected route redirects to `/login?next=…` |

## 9. Instructor workflow

1. `student02` registered with the Instructor application checkbox → `pending` `InstructorRequest`, roles stayed `["student"]`.
2. Verified email, then confirmed via `GET /users/me` that Instructor privileges were **not** granted automatically.
3. Manager (see §10) approved the application in the UI with a mandatory audit reason.
4. Applicant's sessions were revoked by the approval; re-login returned `roles: ["instructor","student"]`.
5. Switched to the Instructor role in the browser → *"Instructor Teaching Console"* dashboard rendered with live cohort metrics.
6. Boundary checks from that session:

| Attempt | Result |
|---|---|
| `GET /admin/users` | `403 Insufficient role` |
| `GET /admin/instructor-applications` | `403 Insufficient role` |
| `POST /admin/users/{id}/suspend` | `403 Insufficient role` |
| `POST /auth/active-role {"role":"manager"}` | `403 Role not assigned` |
| `POST /auth/active-role {"role":"administrator"}` | `403 Role not assigned` |

## 10. Manager workflow

Manager account was appointed by the Administrator (`role.granted` audit event), then verified in the browser:

| Step | Result |
|---|---|
| Login + switch to Manager | `200`, `role.switched` audit, cookie rotated |
| Manager dashboard | live `/admin/users` and `/admin/instructor-applications` data; 2 governed accounts, 1 pending application |
| Approve Instructor application | `200`, decision stored with actor/time/reason, applicant sessions revoked |
| Suspend student account | `200`; student's live session → `401`, login blocked until reactivation |
| Reactivate student account | `200`; login works again |
| `GET /admin/users` | excludes Manager and Administrator accounts entirely |

Restrictions enforced by FastAPI (verified with real requests, not just hidden buttons):

| Attempt | Result |
|---|---|
| Grant Manager to an account | `403 Managers cannot change privileged accounts or roles` |
| Grant Administrator | `403` (same) |
| Suspend an Administrator | `403` (same) |
| Revoke Administrator role | `403` (same) |
| Create another Manager | `403` (privileged target rejected before any write) |

## 11. Administrator workflow

Bootstrap used the existing mechanism (`app.bootstrap_admin.bootstrap_admin`, invoked with a hidden synthetic password; no public signup route exists). The bootstrap password was then rotated through the audited `POST /users/me/password` endpoint, which returned `204` and revoked the bootstrap session.

| Step | Result |
|---|---|
| Login | `200`, roles `administrator, student`, active `student` |
| Activate Administrator **without** MFA | `403 Recent MFA required` (direct API call, bypassing the UI) |
| MFA enrolment | `POST /auth/mfa/enroll` with current password → secret + `otpauth://` URI + QR |
| TOTP verification | `POST /auth/mfa/confirm` → `200`, **8 recovery codes shown once**, other sessions revoked |
| Activate Administrator with step-up | `200`, `role.switched` audit |
| Administrator dashboard | live counters, user directory, role panels, application queue |
| Grant Manager | `200`, `role.granted` audit, target sessions revoked |
| Revoke Manager | `200`, `role.revoked` audit, target session count → 0 |
| Suspend / reactivate | `200` each, audited |
| Suspend **last** Administrator | `409 Cannot remove last active administrator` |
| Revoke **last** Administrator role | `409` (same) |
| Stale step-up (10-minute-old auth) | reads `200`; mutations `403 Recent authentication required` |
| Step-up expiry during a queued action | step-up modal captures the action, re-runs it automatically after verification → application approved |

Also verified: a wrong/expired TOTP code is rejected (`401`) and the code could not be replayed because the verifier tracks the consumed counter window.

## 12. Security review of the authentication proxy

`frontend/app/api/v1/[...path]/route.ts` reviewed and exercised through the browser and HTTP:

| Property | Finding |
|---|---|
| Cookie forwarding | `cookie` header forwarded unchanged; browser keeps the cookie `HttpOnly` for `localhost` |
| `Set-Cookie` passthrough | every upstream `Set-Cookie` appended via `getSetCookie()`; rotation and deletion both observed end-to-end |
| Header filtering | allow-list only (`accept`, `content-type`, `cookie`, `origin`, `sec-fetch-*`, `user-agent`); `authorization` and `x-forwarded-host` are **not** forwarded (asserted in the new test) |
| Origin/CSRF | `origin` and `sec-fetch-site` are forwarded, so FastAPI's origin check runs on every mutation; forged/missing origins return `403` through the proxy |
| Path handling | `..`, `.`, empty, backslash and scheme segments rejected with `400`; `%2e%2e` and encoded slashes never reach FastAPI (`404`/`405`) |
| Error mapping | unreachable backend → `503 {"code":"BACKEND_UNREACHABLE"}`; upstream `401/403/409` pass through unchanged |
| Secret leakage | no tokens in localStorage/sessionStorage, logs or HTML; mail tokens exist only in the private capture directory. **Correction (see §17):** the original version of this report claimed tokens never appear in URLs. Mail links *are* query-token links by design, and the token previously stayed in the address bar after use. This has since been fixed. |
| Request body size | capped by the proxy (`413 BODY_TOO_LARGE`, default 256 KiB) — see §17 |
| Throttle identity | socket peer, or the forwarded address only from a configured trusted proxy — see §17 |
| Methods | `GET/POST/PATCH/PUT/DELETE` implemented; `OPTIONS` → `204` with `Allow` and **no** CORS headers; `TRACE` → `500` (see §15) |

## 13. Automated test results

| Suite | Command | Result |
|---|---|---|
| Backend (SQLite) | `pytest -q` | **32 passed, 3 skipped** |
| Backend (PostgreSQL) | `CYBERLAB_TEST_POSTGRES_URL=… pytest -q` | **35 passed** |
| Frontend typecheck | `npm run typecheck` | pass |
| Frontend lint | `npm run lint` | pass |
| Frontend unit/component | `npm test` | **54 passed (9 files)** |
| Frontend build | `npm run build` | pass |
| Frontend audits | `npm audit`, `npm audit --omit=dev` | 0 / 0 |

New regression coverage added in this milestone:

- `frontend/__tests__/api-proxy.test.ts` (6 tests) — method/path/query/cookie/`Origin` forwarding, header allow-list, `Set-Cookie` passthrough, traversal rejection, `503` mapping, `204` handling, propagation of upstream `401`.
- `backend/tests/test_milestone_01d_integration.py` (3 tests) — suspension blocks sessions and sign-in until reactivation; stale step-up blocks privileged mutations while reads stay available and a reauthentication restores them; role switching stays scoped to one session and unassigned roles cannot be activated.
- `frontend/__tests__/confirm-reason-dialog.test.tsx` (2 tests) — regression for the defect in §14.
- `backend/tests/test_rate_limit_identity.py` (4 tests) — added after the QA review: unrelated failures cannot block a valid login; repeated failures for one account are still throttled; spoofed `X-Forwarded-For` is ignored from untrusted peers; a trustworthy forwarded address gets an independent bucket (§17).
- `frontend/__tests__/api-proxy.test.ts` grew to 10 tests — oversized-body rejection (declared and configured limits) and `X-Forwarded-For` forwarding only when explicitly trusted.
- `frontend/__tests__/token-url-hygiene.test.tsx` (3 tests) — verification and reset tokens are removed from the address bar while remaining usable (§17).

## 14. Bugs found and fixed

**F1 — Confirmation dialog flips to the opposite action while closing (fixed).**
*Symptom (reproduced in the browser):* after approving an Instructor application the closing dialog briefly rendered **"Reject Instructor Application"**; after suspending an account it rendered **"Confirm Role Revocation"**.
*Root cause:* `ConfirmReasonDialog` derives its copy from a nullable pending-action state. Callers clear that state as soon as the mutation resolves, but Radix keeps the dialog mounted for its exit animation, so the final frames rendered the `undefined` fallbacks.
*Fix:* `components/shared/confirm-reason-dialog.tsx` snapshots the copy while open and renders the snapshot during the close animation (no behaviour change for open dialogs).
*Test:* `confirm-reason-dialog.test.tsx` fails on the previous code and passes now; browser re-run shows "Approve Instructor Application" during the close frame.
*Also verified:* after a `403 Recent MFA required`, the step-up modal automatically retries the queued approval and the application ends up approved.

Within the workflows exercised here no privileged path misbehaved. The independent QA review described in §17 subsequently found a real defect in the login throttles when every browser shares the proxy's address; it is fixed below.

## 15. Remaining limitations (documented, not fixed)

1. **`TRACE` returns `500` from Next.js**, not `405`. Next's `NextRequest` constructor throws `TypeError: 'TRACE' HTTP method is unsupported` before the route handler runs. The request never reaches FastAPI and no state changes, but the status code is wrong. Fixing it requires framework-level handling rather than an application change.
2. **Step-up dialog keeps the previous error text** after the user corrects the code; the message only clears on the next submit. Cosmetic.
3. **Session-expiry redirect has no explanatory banner** — users land on `/login?next=…` without being told the session expired.
4. **Accessibility snapshots of Radix dialogs lag one action behind** in the automation tooling; the DOM was verified empty after each mutation, so this is a tooling artefact, not an application defect.
5. **Rate-limit windows had to be cleared once** (`rate_limit_events` in the isolated dev database) to continue re-testing logins within the same 5-minute window. No security setting was changed.
6. No mission, class, assessment or teaching-resource endpoints exist yet, so object-level authorization beyond account objects remains unexercised.
7. MFA cannot be disabled, re-enrolled or have recovery codes regenerated through the API (`OpenAPI v0.2.0` limitation, surfaced honestly in the UI).
8. SMTP delivery was configured but not exercised against a live mail server; the dev capture provider was used.
9. Browser checks are scripted but not part of CI; the frontend workflow runs typecheck, lint, tests and build only.
10. Local secrets live in `/tmp/cyberlab-01d.env`; they must not be reused outside this machine.
11. **Trusted-proxy configuration is a deployment step.** Without `TRUSTED_PROXY_IPS` (and `CYBERLAB_TRUST_INBOUND_XFF=true` for the Next.js hop) every browser shares the proxy address for throttling purposes, and one-time mail links still expose the token to the first request's access log.
12. **Not production ready.** HTTPS/`COOKIE_SECURE=true`, a configured trusted front proxy, monitoring, SMTP, and an independent security assessment remain outstanding.

## 16. Git

| Item | Value |
|---|---|
| Branch | `codex/milestone-01d-integration` |
| Base | `feat/01c1-typography-responsive-ci` @ `9934f02` |
| Commit — integration tests | `a0e5d23` |
| Commit — dialog copy fix | `ad31599` |
| Commit — QA remediation | see `git log` on the branch |
| Commit — this report | see `git log` on the branch |
| Pull request | [#7](https://github.com/TechDaDev/cyberlab-academy/pull/7), open, **not merged** |
| CI | Backend `tests` and frontend `Verify (Node 22)` jobs pass |
| `main` | untouched |

## 17. Independent QA review findings and remediation

An independent QA pass (local report `docs/CODEX_01D_INDEPENDENT_VERIFICATION_REPORT.md`, not committed) rejected the milestone for acceptance and raised three defects plus one HTTP-hygiene issue. All are addressed below, with reproduction and regression tests.

### 17.1 High — shared proxy address could lock every account out of login (fixed)

*Reproduction:* 40 failed logins for different unknown addresses through the Next.js proxy exhausted a single `login_ip` bucket (the proxy's loopback address), after which a **correct** login for an unrelated account returned `429`.

*Root cause:* the proxy reaches FastAPI from one address, so `request.client.host` was identical for every browser, and the login endpoint consumed the tight IP bucket on *every* attempt, including attempts that were about to fail for unrelated addresses.

*Fix:*

- `backend/app/security.py` resolves the throttle identity through `client_address()`: the socket peer, or the **last** `X-Forwarded-For` hop only when the peer is listed in `TRUSTED_PROXY_IPS`. Client-supplied headers from untrusted peers are ignored, so the address cannot be spoofed into fresh buckets.
- `backend/app/routes_auth.py` no longer charges the credential throttles before authentication. Only failed attempts consume `login` (address + email, 8/5 min), `login_account` (email, 20/15 min) and `login_global` (5000 failures/5 min site-wide). The pre-auth `login_ip` burst ceiling rose from 40 to 300 attempts/5 min to bound password-hashing cost without being trivially exhausted.
- Registration and recovery IP ceilings rose from 20 to 60 per hour with 2000-per-hour global safety ceilings.
- `frontend/app/api/v1/[...path]/route.ts` forwards `X-Forwarded-For` **only** when `CYBERLAB_TRUST_INBOUND_XFF=true`, i.e. only behind a front proxy that appends the real peer. Default is off so the header cannot become a spoofable identity.

*Verification:* live reproduction through the proxy: 45 failures for distinct addresses returned `401` for all 45, and the subsequent valid login for an unrelated account returned `200`. Nine failures against one account still return `401 ×8` then `429`, and the correct password for that account still succeeds. Tests: `backend/tests/test_rate_limit_identity.py` (4 tests).

*Residual risk:* every client sharing one address (NAT, or this local proxy with no trusted front proxy) shares the per-address bucket, by design; it is now only reachable after 300 attempts / 5 minutes and only blocks further *failures* from being reported, while correct credentials still log in. Deployments should terminate TLS at a proxy that appends `X-Forwarded-For` and set `TRUSTED_PROXY_IPS` + `CYBERLAB_TRUST_INBOUND_XFF=true`.

### 17.2 Medium — one-time tokens stayed in the browser URL (fixed)

*Reproduction:* after a successful email verification and after a completed password reset, `location.search` still contained `token=…`; the token pages were also served with the default long-lived cache policy.

*Fix:*

- `frontend/lib/scrub-token-url.ts` and both token views capture the token once into component state and call `history.replaceState` to remove it from the URL and the current history entry before using it.
- `next.config.mjs` serves `/verify-email` and `/reset-password` with `Cache-Control: no-store, max-age=0` and `Referrer-Policy: no-referrer`; all other routes keep `strict-origin-when-cross-origin`.

*Verification:* browser run — after `Email Address Verified`, `location.href` is `http://localhost:3000/verify-email`; the reset form scrubs before submission and still completes the reset. Header check: both routes return `no-store` + `no-referrer`. Tests: `frontend/__tests__/token-url-hygiene.test.tsx` (3 tests).

*Residual risk:* the initial navigation still carries the token in the query string (by design of mail links), so the first request can appear in infrastructure access logs; a fragment-based link would avoid that and is a candidate follow-up.

### 17.3 Medium — proxy buffered unbounded request bodies (fixed)

*Reproduction:* an 8 MiB body to `POST /api/v1/auth/register` was read and forwarded.

*Fix:* the proxy now rejects oversized bodies with `413 {"detail":"Request body too large","code":"BODY_TOO_LARGE"}` before allocating the string, checking `Content-Length` first and streaming with a byte counter otherwise. The limit defaults to 256 KiB and is configurable with `CYBERLAB_MAX_PROXY_BODY_BYTES`.

*Verification:* 8 MiB body through the proxy returns `413` in ~2 ms without reaching FastAPI. Tests: two additions in `frontend/__tests__/api-proxy.test.ts` (declared length and configured limit).

### 17.4 Low — `TRACE` returns `500` (accepted limitation)

Next.js throws `TypeError: 'TRACE' HTTP method is unsupported` inside `NextRequest` construction before the route handler runs, so the application cannot return `405`. No request headers or body are reflected and FastAPI never sees the call. Recorded with the server log evidence; it requires a fix at the HTTP server/edge layer.

### 17.5 Re-verification after remediation

| Gate | Result |
|---|---|
| Backend SQLite | 32 passed, 3 skipped |
| Backend PostgreSQL 17 | 35 passed |
| Frontend typecheck / lint | pass |
| Frontend tests | 54 passed (9 files) |
| Frontend build | pass |
| `npm audit` / `--omit=dev` | 0 / 0 |
| Full four-role browser matrix, 1440×900 and 390×844 | 32 page loads per viewport set: no console errors, no unexpected failed requests, no horizontal overflow, no token query parameters left in the URL |
| Live QA reproduction through the proxy | 45 unrelated failures → all `401`; unrelated valid login → `200`; same-account `429` after 8 failures; 8 MiB body → `413` |

The full browser matrix from §6 was re-run after these fixes (public pages plus all four dashboards and all four settings pages, at desktop and mobile widths) because the previous pass had only been reproduced partially by QA.
