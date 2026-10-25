# Milestone 01D — Independent QA and Security Verification

**Date:** 2026-10-24  
**Review target:** [PR #7](https://github.com/TechDaDev/cyberlab-academy/pull/7), `codex/milestone-01d-integration` at `8dd622eb64eabfae470559a32da7a6ee612c2e1e`  
**Original decision at `8dd622e`:** **FAIL for stable integration baseline acceptance.** Automated tests and the exercised account flows passed, but an unauthenticated caller could exhaust a rate-limit bucket shared by all users behind the Next.js proxy. Two further security hardening issues required correction. The 2026-10-25 retest below records the current PR-head decision. Neither assessment establishes production readiness.

## Retest — 2026-10-25, PR #7 at `ad8d24110420ec13675fa97b4ac57c0dd17d87e9`

**Decision remains FAIL.** The token-URL and request-body findings are fixed in this head. The shared-address login denial persists at the new 300-attempt ceiling. This retest used a new isolated PostgreSQL 17 database, `cyberlab_codex_retest_38f0641d`, with FastAPI on port 8002 and Next.js on port 3002. Existing services and the earlier `cyberlab_01d` database were not modified.

| Retest gate | Result |
|---|---|
| Backend `pytest -q`, no PostgreSQL test URL | 32 passed, 3 skipped, 1 Starlette/httpx deprecation warning |
| Backend `pytest -q` with `CYBERLAB_TEST_POSTGRES_URL` pointing to the isolated database | 35 passed, 0 skipped, same warning |
| Fresh PostgreSQL `alembic upgrade head; alembic current; alembic check` | `0002_account_security (head)`; no pending operations |
| Frontend `npm ci; npm run typecheck; npm run lint; npm test; npm run build` | All passed; 54 tests across 9 files; build listed 18 routes including `/_not-found` |
| Frontend `npm audit; npm audit --omit=dev` | 0 vulnerabilities in both |
| Live OpenAPI parity | 27 paths; identical to `shared-contracts/openapi.json` |
| [Backend CI](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40125498458/job/120965921340), [Frontend CI](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40125498486/job/120965921524) | Both passed at the new PR head |

### High finding still reproducible — correct login blocked by the shared IP ceiling

The remediation moved the per-account credential throttles to failed logins, but `login_ip` still runs **before password verification** in `backend/app/routes_auth.py`. With default proxy settings, all browser requests have the same FastAPI socket peer and therefore the same `login_ip` key in `backend/app/security.py`.

Two independent live checks passed through the real Next.js proxy. First, 45 failed logins for distinct unknown email addresses returned 401 and a correct login for a different verified account returned 200. Second, after clearing only the new QA database's `rate_limit_events`, **300** failed logins for 300 distinct unknown addresses returned 401; the next correct login for the unrelated verified account returned **429**. The 300 requests completed in about 19 seconds locally. A separate controlled check that seeded the same QA bucket to 300 produced the same 429. This contradicts the new integration report's statement that the ceiling “only blocks further failures.” The new regression test covers 45 failures, not the 300-attempt ceiling.

**Expected:** A caller without valid credentials cannot deny login to an unrelated account. **Observed:** An unauthenticated caller still can, at a higher threshold. **Required correction:** Ensure a saturated shared-address bucket does not reject valid credentials, or provide a verified per-client address at the deployed trust boundary. Keep failed-login and account-scoped throttles. Add a regression test at the actual 300-attempt ceiling through the proxy topology.

### Fixed findings verified independently

- **Token URLs:** A fresh Chrome mobile session opened a verification link and reached **Email Address Verified** with no `token=` in `location.search`. The reset page had already removed the token before form submission, and password reset completed with no token in the URL. Browser localStorage and sessionStorage were empty. Both token pages returned `Cache-Control: no-store, max-age=0` and `Referrer-Policy: no-referrer`. The initial mail-link navigation still carries the query token, so first-hop access-log handling remains a deployment consideration.
- **Proxy body limit:** An 8 MiB declared request to `/api/v1/auth/register` returned 413 in about 5 ms. A 330 KiB chunked request without `Content-Length` also returned 413. The source caps the streamed byte count at 256 KiB by default before forwarding. These checks cover both declared and streamed bodies.
- **TRACE:** Still returns 500 with plain `Internal Server Error`; no reflected headers were observed. This remains the documented Low finding.

The retest reviewed all 14 files changed since `8dd622e`, including the proxy and throttle tests. The new tests exercise useful cases but do not close the threshold gap above. Browser testing in this retest focused on token routes and mobile viewport behavior; the full four-role browser matrix was not repeated independently. No application source, existing tests, commit, push, or merge was changed by this QA retest.
The QA services on ports 8002 and 3002 and the temporary Chrome process were stopped. Retest credentials, captured mail links, and the browser profile were removed. The isolated retest database remains for defect reproduction; existing services on ports 8000 and 3000 remain running.

## Environment and isolation

- Ubuntu 24.04.5 LTS; Python 3.12.3; Node.js 22.22.1; npm 10.9.4; Next.js 16.4.3; PostgreSQL 17.10.
- The checkout was clean before review and exactly matched PR #7's remote head after `git fetch origin --prune`. PR #7 targets `feat/01c1-typography-responsive-ci` and changes five files.
- Existing services on ports 8000 and 3000 and the `cyberlab_01d` database were left untouched. A separate PostgreSQL database, `cyberlab_codex_01d_075f32c1`, served FastAPI on `127.0.0.1:8002` and Next.js on `localhost:3002`.
- Credentials, encryption key, and captured links remained in mode-0600 files under `/tmp` or process environment; the Chrome profile was isolated under `/tmp`. Accounts used synthetic `@qa.example.org` addresses. Preview demonstration authentication was disabled in the production frontend build.
- Fresh database migration reached `0002_account_security (head)`; `alembic check` found no pending schema operations. Live `/openapi.json` exactly matched `shared-contracts/openapi.json` (27 paths).

## Executed gates

| Command or procedure | Independent result |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | 28 passed, 3 PostgreSQL-dependent tests skipped, 1 Starlette/httpx deprecation warning |
| `cd backend && set -a; . /tmp/cyberlab-codex-01d.env; set +a; unset DATABASE_URL BIND_HOST BIND_PORT RELOAD ALLOWED_ORIGINS ALLOWED_HOSTS FRONTEND_URL MAIL_CAPTURE_DIR; .venv/bin/python -m pytest -q` | 31 passed, 0 skipped, same warning. An initial run with a QA-only `ALLOWED_ORIGINS` override produced 28 test-configuration failures; the run above restored the tests' expected Origin defaults. |
| `cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic current && .venv/bin/alembic check` | `0002_account_security (head)`; no new upgrade operations |
| `cd backend && .venv/bin/python -m pip check` | No broken requirements |
| `cd frontend && npm ci` | Installed 596 packages; 0 vulnerabilities |
| `cd frontend && npm run typecheck` | Passed |
| `cd frontend && npm run lint` | Passed |
| `cd frontend && npm test` | 47 tests passed across 8 files |
| `cd frontend && npm run build` | Passed; 18 listed routes including `/_not-found`, 17 application routes |
| `cd frontend && npm audit` | 0 vulnerabilities |
| `cd frontend && npm audit --omit=dev` | 0 vulnerabilities |
| Isolated HTTP/SQL verification script, `/tmp/cyberlab-codex-01d-verify.py` | 52/52 status and persistence checks passed via the real Next.js proxy and PostgreSQL |

The 52 checks included registration, duplicate-token rejection, verification, login, profile persistence, two independent sessions, instructor approval, manager scope, role revocation effects, suspension/reactivation, administrator MFA and last-administrator guards, password reset and revocation, session expiry, Origin rejection, and audit rows. Direct PostgreSQL inspection found four accounts, one decided Instructor application, and 29 audit events at the end of that run. Subsequent browser and rate-limit probes added more synthetic records. No source or existing test assertions were changed.

## Browser verification

Chrome headless DevTools Protocol exercised the actual Next.js frontend at desktop 1440×900 and mobile 390×844. A fresh Student completed the registration form; the UI showed HTTP 202 and the generic verification message. The browser opened its private captured verification link and showed **Email Address Verified**. Login through the form reached `/dashboard/student`; the name and verified status matched PostgreSQL. The session cookie was `HttpOnly`, `SameSite=Lax`, and absent from `document.cookie`; `Secure=false` was intentional for local HTTP. The dashboard labeled synthetic curriculum data **DEMO PREVIEW**. Screenshots were inspected for mobile registration and Student dashboard; neither had horizontal overflow. Browser password-reset form completed successfully.

Manager, Administrator, Instructor, suspension, role grant/revocation, MFA, and session-expiry behavior were exercised through real HTTP requests and SQL inspection, not through every corresponding browser control. A full four-role browser acceptance pass, console/network trace across all pages, and actual Radix exit-animation capture remain unverified. These limits do not affect the directly reproduced security findings below.

## Security findings

### High — A shared proxy IP rate limit can block unrelated users

**Affected files:** `backend/app/security.py` (`check_rate_limit`), `backend/app/routes_auth.py` (`login`, plus IP-scoped registration and recovery calls), `frontend/app/api/v1/[...path]/route.ts` (proxy). This behavior predates PR #7 but affects its integration baseline.

**Reproduce:** On the isolated stack, send failed `POST /api/v1/auth/login` calls through `localhost:3002` for different unknown email addresses. There were 11 previous `login_ip` events. Another 29 calls returned 401, the next returned 429, and a correct login for a separate verified account also returned 429. All requests reached FastAPI from the proxy's loopback address, so `request.client.host` was the same for every browser. The `login_ip` limit is 40 events per five minutes. Registration and forgot-password also use shared `*_ip` buckets.

**Expected:** One caller's failed attempts must not block unrelated accounts across the entire site. **Observed:** Any unauthenticated caller can trigger a temporary site-wide login denial with 40 requests. **Correction:** Define and verify the client-address trust boundary at the proxy; rate-limit on a trustworthy client identity and account key, with a bounded global safety limit that cannot trivially deny service to all users. Test multiple distinct browser clients through the deployed proxy topology.

### Medium — One-time tokens remain in browser URLs after use

**Affected files:** `frontend/features/auth/verify-email-view.tsx`, `frontend/features/auth/reset-password-form.tsx`, `frontend/next.config.mjs`, `backend/app/mail.py`. The PR report's claim that there are “no tokens in URLs” is incorrect.

**Reproduce:** Open a fresh verification mail link in Chrome. After **Email Address Verified**, `location.search` still contains `token=`. Complete a password reset; `location.search` still contains `token=`. The links originate with query tokens by design. Both page responses used `Cache-Control: s-maxage=31536000` and `Referrer-Policy: strict-origin-when-cross-origin` rather than sensitive-page policies. The token was not found in browser localStorage or sessionStorage. The cached HTML is a static shell; this test does not establish that its body contains the token.

**Expected:** Capture the token for the single API submission, then remove it from the visible URL and history promptly; serve token pages with `no-store` and `no-referrer`. **Observed:** Redeemed and reset tokens remain in browser history and can appear in same-origin referrers or access logs. **Correction:** Scrub the query with `history.replaceState` after reading it; set stricter headers on both token routes. Add browser tests for success and failure paths.

### Medium — The API proxy reads request bodies without a size bound

**Affected file:** `frontend/app/api/v1/[...path]/route.ts`. This issue predates PR #7 and its new proxy tests do not cover it.

**Reproduce:** Send an 8 MiB body to `POST /api/v1/auth/register` through Next.js. The proxy consumed and forwarded it; FastAPI returned 422 in about 0.06 seconds. Source inspection confirms `await request.text()` has no length check before allocating a JavaScript string and forwarding it. This demonstrates absence of an application-level cap, not a measured denial of service.

**Expected:** Reject oversized request bodies early with 413. **Observed:** Proxy accepts at least 8 MiB for a small JSON endpoint. **Correction:** Enforce bounded request size before buffering and add a proxy regression test at and above the limit. Consider an edge/server limit as a second control.

### Low — Unsupported TRACE returns 500

**Affected area:** Next.js request handling before `frontend/app/api/v1/[...path]/route.ts` runs.

**Reproduce:** `curl -i -X TRACE http://localhost:3002/api/v1/health` returned 500 and plain `Internal Server Error`; normal GET returned 200. No reflected request headers or body were observed, and the FastAPI backend did not receive a state-changing request. **Expected:** 405 or 501. **Correction:** Handle or reject TRACE at the HTTP server or edge before Next.js constructs its request object. This is incorrect status handling, not evidence of cross-site tracing or an authentication bypass.

## Other security checks

- Direct unauthenticated `/admin/users` returned 401. Student and Instructor requests returned 403. Manager could not grant Manager or suspend Administrator. Administrator could not suspend the only active Administrator (409).
- Administrator role activation without MFA returned 403; enrollment and TOTP confirmation then allowed activation. Stale sessions and reset-revoked sessions returned 401. Cross-origin and missing-Origin login mutations returned 403 through the proxy.
- Path probes for encoded traversal, encoded slash, backslash, and scheme-like segments returned 404, 405, 400, and 400 respectively; none yielded an internal endpoint response. The proxy forwards only allow-listed request headers and upstream `Set-Cookie`, `Content-Type`, cache, and referrer headers. Its new unit tests cover these basic cases, but not client-IP trust or body size.
- Verification/reset tokens were SHA-256 digests in PostgreSQL, single-use in the exercised flows. Browser storage held no tokens. Production access logs, third-party analytics, and external SMTP were not available to audit, so absence of leakage there is unverified.

## PR #7 review and comparison with its report

PR #7 changes `backend/tests/test_milestone_01d_integration.py`, `frontend/__tests__/api-proxy.test.ts`, `frontend/__tests__/confirm-reason-dialog.test.tsx`, `frontend/components/shared/confirm-reason-dialog.tsx`, and `docs/MILESTONE_01D_INTEGRATION_REPORT.md`. The dialog fix snapshots title, description, button label, and variant while open; the new component tests correctly assert that the old wording survives a closing render and new wording appears for a new action. Their dialog mock keeps content mounted, so the tests do not independently verify Radix's real exit animation. No application-source regression was observed in the changed component.

PR #7's backend 28+31 and frontend 47 test counts, migration head, OpenAPI parity, and two successful GitHub CI jobs were confirmed. [Backend CI](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40122864766/job/120957992524) and [Frontend CI](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40122864789/job/120957992593) both passed at the reviewed head. The report's broad “no tokens in URLs” claim is contradicted by both mail-link construction and browser observation. Its “no functional backend or authentication defect” conclusion misses the shared proxy IP lockout. The full browser matrix, absence of console errors on every page, and Radix close-frame claim were not independently reproduced here.

## Required before acceptance

1. Fix the shared proxy-client rate-limit identity and add an end-to-end multi-client regression test. Re-run all gates.
2. Remove one-time tokens from the browser URL/history after capture and give verification/reset pages sensitive-page cache and referrer headers.
3. Bound proxy request bodies and test the limit. Treat TRACE's 500 as lower-priority HTTP hygiene.
4. Repeat the complete four-role browser acceptance matrix, including real dialog close animation and console/network inspection, after fixes.

PR #7 remains open. This QA report is local only; no commit, push, merge, or application-source edit was made.
The QA services on ports 8002 and 3002 and the temporary Chrome process were stopped. Temporary credentials, captured mail, token-link files, and the Chrome profile were removed. The isolated synthetic PostgreSQL database remains available for defect reproduction; existing services on ports 8000 and 3000 remain running.

## Final independent retest — 2026-10-25, PR #7 at `14d2107cab123a745f52feb483cdbe1fe4346a4d`

**Decision: FAIL for Milestone 01D acceptance.** Commit `811cc7f` fixes the original shared-proxy login lockout in the default, untrusted-proxy configuration. The controlled trusted-proxy configuration fails the explicit client-identity criteria. The historical findings above refer to an earlier head; the results below supersede their remediation status. PR #7 remains open and unmerged. This is a local acceptance decision, not a production-readiness claim.

### Scope and isolation

Fetched the remote branch and confirmed local HEAD, remote branch, and PR head all equal `14d2107cab123a745f52feb483cdbe1fe4346a4d`. Reviewed the actual diff since `ad8d241` and the requested architecture, roles, integration, fix, Arena API, prior QA, and implementation documents. No application source or existing tests were edited. This section was appended to the existing untracked report.

Used new PostgreSQL 17 database `cyberlab_codex_finalqa_88820146` on loopback port 5433, synthetic accounts, and private files outside Git. API/Next.js ran locally on 8002/3002; additional isolated processes on 8003, 8004, 3003, and 3004 exercised saturation and proxy trust. Existing `cyberlab_01d`, services on 8000/3000, sessions, and Docker volumes were untouched. `alembic current` showed `0002_account_security (head)`; `alembic check` found no pending operations. The live OpenAPI document matched `shared-contracts/openapi.json` (27 paths).

### Authentication and PostgreSQL results

| Check | Independent observation |
|---|---|
| Original exploit, real Next.js proxy and Argon2 | 300 failed logins for 300 distinct unknown emails returned **300 × 401** in 17.4 seconds. Immediate correct login for an unrelated verified user returned 200; `/users/me` returned 200, logout 204, then `/users/me` 401. No persistent shared-address lockout. |
| Account thresholds | Eight wrong passwords for account A returned 401, the ninth 429; A's correct password and unrelated B's correct password each returned 200. First invalid response for known and unknown emails had identical status/body. A had exactly eight failed-login audit entries. Default no-trust mode recorded no `login_ip` or `login_ip_failures` events. |
| PostgreSQL races with real hashing | 24 simultaneous wrong passwords for one account yielded 8 × 401 and 16 × 429; six for a second account yielded 6 × 401. Persisted rate-limit and failure-audit rows were exactly 8 and 6 respectively, with no granted advisory lock afterward. Both correct passwords still worked. No 503 occurred at normal hash concurrency 16. |
| No trusted proxy | Nine wrong passwords against one email through Next.js with rotating forged `X-Forwarded-For` gave 8 × 401 then 429; correct credentials returned 200. Trusted-only address counters stayed absent. |

The PostgreSQL race test confirms the advisory transaction lock serializes counted failures; rejected attempts did not persist an extra failure event. Correct credentials were still admitted after throttled failures.

### Controlled trusted-proxy failure

Configured FastAPI on 8004 with `TRUSTED_PROXY_IPS=127.0.0.1`, Next.js on 3003 with `CYBERLAB_TRUST_INBOUND_XFF=true`, and a temporary front proxy on 3004 that **overwrote** incoming `X-Forwarded-For` with its actual client socket address. Clients connected from `127.0.0.2` and `127.0.0.3`. Twenty-one failed logins for distinct unknown emails from the first client all returned 401; one from the second returned 401. One forgot-password request from the first returned 200. PostgreSQL contained **zero** `login_ip_failures` and **zero** `forgot_ip` events. The first client's 21st failure should have hit the documented 20-per-five-minute verified-address ceiling. A separate fixed-client, same-account series still yielded 8 × 401 then 429, and a correct login returned 200: the account limit works, but the verified-address limit does not.

`backend/app/run.py` enables Uvicorn proxy-header processing whenever `TRUSTED_PROXY_IPS` is nonempty. Uvicorn rewrites ASGI `scope["client"]` using the forwarded header before `backend/app/security.py:trusted_client_address()` checks `request.client.host` against the configured *immediate proxy*. That check sees the forwarded client instead of `127.0.0.1` and returns `None`. `client_address()` then uses this rewritten value as a purported socket-peer fallback. The application cannot validate the immediate peer at this layer in the running configuration. TestClient does not run Uvicorn's proxy middleware, which explains why the unit tests missed it.

Directly reaching Next.js on 3003, bypassing the sanitizing front proxy, allowed a different forged `X-Forwarded-For` on each of nine wrong-password attempts against one fresh account. **All nine returned 401**, bypassing the eight-failure per-source ceiling; the 20-failure account-wide ceiling remains a backstop. `frontend/app/api/v1/[...path]/route.ts` forwards inbound XFF whenever the trust flag is true without checking that the immediate caller is the intended front proxy. This is a controlled local bypass, not a claim about an external deployment. Blocking direct access to Next.js could remove this specific path, but it would not restore the missing trusted-only counters observed through the sanitized front proxy.

**Medium, acceptance blocking — broken trusted-proxy validation and address counters.** Preserve the actual socket peer separately from forwarded identity or use one correctly placed trusted-proxy resolver; validate the immediate peer before accepting forwarded data. Restrict Next.js to a sanitizing ingress whenever trust is enabled. Add a real Uvicorn + Next.js integration test with two client addresses, a forged header, and the 20-failure address threshold. TestClient alone cannot establish this guarantee.

### Hash capacity and related routes

With `AUTH_HASH_CONCURRENCY=1` and `AUTH_HASH_QUEUE_SECONDS=0` in one API process, 24 simultaneous unknown-email logins yielded 23 × 503 and 1 × 401. Every 503 included `Retry-After: 1`; legitimate login returned 200 after the burst. Twelve simultaneous new registrations yielded 10 × 503 and 2 × 202; a rejected registration retried successfully with 202. RSS was 86,184 KiB before the login burst, 93,884 KiB afterward, and 94,740 KiB after registration. No runaway growth was seen in these small local bursts. Focused synthetic exception checks confirmed that guarded verification and hashing both release their semaphore slots. The semaphore is per Uvicorn process: multiple workers or replicas multiply total hashing capacity, so deployment needs an overall edge/resource budget. That limitation is distinct from the local acceptance defect.

Through the default shared proxy, 80 distinct unknown-email forgot-password calls returned 200, 20 distinct verification-resend calls returned 200, and 40 distinct registrations returned 202; another legitimate registration returned 202. Same-mailbox resend gave three 200 then 429. Known and unknown forgot-password responses matched; duplicate registration returned the same generic 202 body. After resend, the old verification token returned 400, the new token 200, and reuse 400. Fifteen unrelated invalid verification tokens and 12 unrelated invalid reset tokens did not block the valid tokens; reset returned 200, reuse 400, and the new password logged in. The no-trust topology created no shared `register_ip`, `register_global`, `forgot_ip`, or `forgot_global` events.

Previous fixes remained effective in targeted checks: verification/reset pages returned `Cache-Control: no-store, max-age=0` and `Referrer-Policy: no-referrer`; 8 MiB declared and 330 KiB chunked bodies returned 413. In a real browser at 390×844, token query parameters disappeared from verification and reset URLs, local/session storage held no token, and pages had no horizontal overflow. Login cookies were HttpOnly and SameSite=Lax. Missing or hostile Origin login requests returned 403. A synthetic Administrator could not activate the role before MFA (403), then enrolled and confirmed TOTP, activated it (200), and could not suspend the final active Administrator (409). Password reset revoked an old session (`/users/me` 401), rejected token reuse, and allowed login with the new password. This was a targeted retest; the complete four-role browser matrix was not independently repeated.

### Regression gates, CI, and documentation

| Gate | Result |
|---|---|
| Backend full suite, SQLite | **35 passed, 5 skipped**; one Starlette/httpx deprecation warning |
| Backend full suite, isolated PostgreSQL 17 | **40 passed, 0 skipped**; same warning |
| Frontend `npm ci` | 596 packages; 0 reported vulnerabilities |
| Frontend typecheck, lint, build | All passed; build listed 18 routes including `/_not-found` |
| Frontend tests | **54 passed** in nine files |
| `npm audit` / `npm audit --omit=dev` | 0 / 0 vulnerabilities |
| GitHub Actions at reviewed head | [Backend job](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40151237398/job/121043037808) and [frontend job](https://github.com/TechDaDev/cyberlab-academy/actions/runs/40151237413/job/121043038113) successful |

Documentation inconsistencies remain. `docs/ARENA_FRONTEND_API_GUIDE.md:40` still says `login_ip` counts 300 **raw** attempts per five minutes, contradicting its new failure-only table at line 47 and the implementation. Line 102 lists 503 only for MFA encryption, although lines 47/53 also describe hash-saturation 503. The fix report's lines 91–99 and integration report §17.1 claim immediate-peer validation and effective trusted-only counters; the live Uvicorn topology above contradicts these claims. The integration report correctly notes process-local hash admission and transient 503, but omits this trusted-boundary failure. The old report's TRACE 500 remains a previously observed lower-priority HTTP-status issue, outside the final retest's acceptance criteria.

**Acceptance:** The original High-severity shared-address lockout is closed locally. Account isolation, PostgreSQL synchronization, hash recovery, registration/recovery availability, prior security fixes, full automated suites, and current CI passed the checks above. Milestone 01D remains **FAIL** because the enabled trusted-proxy path neither enforces verified client-address limits nor reliably rejects forged identity when Next.js is directly reachable. Correct the proxy boundary and rerun this controlled integration test before acceptance. Production readiness was not established.

The isolated retest services on 8002/3002, 8003, 8004/3003, and 3004 and the temporary browser were stopped. Private retest environment, synthetic account/link files, captured mail, and browser profile were removed. The isolated PostgreSQL database remains for reproduction; existing services on 8000/3000 remain running. No commit, push, or merge was made.
