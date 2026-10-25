# Milestone 01D — Shared-Proxy Login Denial-of-Service Fix

Focused remediation of the single High-severity finding left open by the independent QA
pass (Codex, `docs/CODEX_01D_INDEPENDENT_VERIFICATION_REPORT.md`, local and uncommitted).

Scope: one vulnerability class (unauthenticated lockout through a shared, unverified
proxy address). No new features, no schema changes, no frontend behaviour changes.

This report describes the implementation and the development checks that were run.
It does **not** declare the finding closed; Codex re-tests independently.

Branch: `codex/milestone-01d-integration` (PR #7, not merged)
Reviewed commit before this change: `ad8d24110420ec13675fa97b4ac57c0dd17d87e9`
Fix commit: `811cc7f` (`Remove pre-authentication login gate that allowed shared-address lockout`)

---

## 1. Root cause

Every authenticated browser request reaches FastAPI from the Next.js proxy, so
`request.client.host` is the same loopback address for all users whenever no trusted
front proxy is configured (the local deployment topology). The login endpoint consumed a
counted bucket keyed on that address:

```python
check_rate_limit(db, request, "login_ip", limit=300, seconds=300)   # before verification
```

Two independent defects followed from that placement:

1. **The bucket was charged before credentials were checked.** Any request — including
   requests for email addresses that do not exist — could consume it.
2. **The bucket identity was shared infrastructure, not a client.** Because the proxy
   address is the same for everybody behind it, exhausting the bucket denied login to
   *all* accounts, not to the caller that filled it.

An unauthenticated attacker therefore had a cheap, complete denial of service against the
entire authentication flow: 300 failed logins (≈19 s in QA's reproduction) made every
subsequent login return `429`, including correct credentials for unrelated, verified
accounts. Raising the ceiling only moved the constant; the structure of the control was
the defect.

The same shape existed in three other pre-authentication endpoints:

| Endpoint | Shared bucket (before) | Effect |
|---|---|---|
| `POST /auth/register` | `register_ip` 60/h + `register_global` 2000/h | one caller could stop registration for everyone behind the proxy |
| `POST /auth/forgot-password` | `forgot_ip` 60/h + `forgot_global` 2000/h | one caller could stop password recovery for everyone behind the proxy |
| `POST /auth/verify-email`, `POST /auth/reset-password` | keyed on the caller address | one caller could stop *other* users' token submissions |

## 2. Security impact

- **Integrity/confidentiality:** none directly.
- **Availability:** complete authentication lockout (login, and by extension registration
  and account recovery) for all users of a deployment whose clients share a front-proxy
  address — the default for the documented local topology and any deployment that does
  not terminate client identity at a trusted proxy.
- **Attacker cost:** 300 unauthenticated HTTP requests. No account, credential, or
  resource investment.
- **Severity:** High (unauthenticated denial of service on the authentication boundary,
  reachable at the documented deployment shape, trivially repeatable).

## 3. Design selected

The control is split along the line the original design blurred: **credential abuse is
account-scoped state; infrastructure capacity is transient back-pressure.** Neither may be
keyed on an identity that unrelated users share and that an attacker can fill.

1. **No counted pre-authentication bucket on login.** The login endpoint performs no
   throttled check before credential verification. A caller who cannot authenticate
   therefore cannot make the endpoint reject anybody.
2. **Failure-only credential throttles.** The account's failed-attempt counters are
   charged *after* verification fails, and generic `401` responses are unchanged:

   | Bucket | Key | Ceiling | Purpose |
   |---|---|---|---|
   | `login` | client identity + email | 8 / 5 min | per-source credential abuse |
   | `login_account` | email | 20 / 15 min | account-scoped brute force |
   | `login_ip_failures` | verified client address | 20 / 5 min | source-level abuse (trusted proxies only) |
   | `login_global` | — | 5000 failures / 5 min | monitoring tripwire for mass failures |

   Because every one of these is charged only on failure, a *correct* credential is never
   rejected by them — the 301st attempt with the right password still logs in.
3. **Capacity protection instead of a counted lockout.** Password hashing is the expensive
   part of an unauthenticated request, so it now runs under admission control: at most
   `AUTH_HASH_CONCURRENCY` (default 16) concurrent hashes, queueing for at most
   `AUTH_HASH_QUEUE_SECONDS` (default 2) before returning `503` with `Retry-After: 1`.
   This is pure back-pressure: it keeps no per-identity state, is released the moment a
   hash finishes, and cannot pin a fixed window of denial on a shared address. A flood
   costs the attacker sustained concurrency, not 300 sequential requests.
4. **Trust boundary made explicit.** `trusted_client_address()` returns a forwarded address
   only when the *immediate peer* is listed in `TRUSTED_PROXY_IPS` **and** that peer
   supplied `X-Forwarded-For`; the value used is the last hop. Otherwise it returns
   `None`. `client_address()` (socket peer only) remains the accounting fallback and is
   never taken from a header.
5. **Address-keyed buckets are trusted-only.** `register_ip` (20/h), `forgot_ip` (20/h) and
   `login_ip_failures` (20/5 min) are skipped entirely when the client identity is not
   verified, so they cannot exist as shared lockout vectors. Where the identity *is*
   verified, per-client buckets are genuinely per client: a verified address is preferred
   over the socket peer when composing bucket keys.
6. **Token submissions keyed on the token.** `verify-email` (10/5 min) and
   `reset-password` (8/5 min) now throttle per `sha256(token)` instead of per caller
   address, so one client cannot deny other users' link submissions, while guessing is
   still rate-limited per guessed token.
7. **Account-scoped anti-abuse and anti-enumeration preserved.** Registration, verification
   resend and forgot-password keep their per-email ceilings (`5/h`, `5/h`, `5/h`) plus
   `3/h` per source for the same email, which bounds mail flooding *per mailbox* — the
   only identity these endpoints legitimately own. Responses remain generic and identical
   for known and unknown addresses, and delivery still runs in a background task.
8. **Duplicate registration race handling unchanged** (`IntegrityError` → same generic
   `202`).

### What is *not* done

- The IP ceilings were not raised again; the shared bucket was removed, not enlarged.
- No new global pre-authentication ceiling that could recreate the same lockout exists on
  login. `login_global` is a post-verification failure counter: exhausting it only changes
  the status of *failing* attempts from `401` to `429`.
- No `X-Forwarded-For` trust was enabled. `CYBERLAB_TRUST_INBOUND_XFF` remains `false` by
  default and `TRUSTED_PROXY_IPS` remains empty in the local environment.

## 4. Files changed

| File | Change |
|---|---|
| `backend/app/security.py` | `trusted_client_address()` (verified downstream identity or `None`), `client_address()` reduced to the socket peer, `check_rate_limit(..., trusted_client_only=...)`, verified address preferred in bucket keys, `verify_password_guarded()` / `hash_password_guarded()` with a bounded semaphore, `AUTH_HASH_CONCURRENCY` / `AUTH_HASH_QUEUE_SECONDS` |
| `backend/app/routes_auth.py` | removed the pre-authentication `login_ip` gate; failure-only credential throttles; trusted-only `register_ip` / `forgot_ip` / `login_ip_failures`; removed `register_global` / `forgot_global`; token-keyed `verify_token` / `reset_password`; guarded hashing on registration and reset |
| `backend/tests/test_rate_limit_identity.py` | rewritten regression suite (7 tests) |
| `backend/tests/test_postgres_integration.py` | +2 PostgreSQL tests (concurrent failures, shared-address spray) |
| `docs/MILESTONE_01D_INTEGRATION_REPORT.md` | §17.1 corrected to describe this design |
| `docs/ARENA_FRONTEND_API_GUIDE.md` | rate-limit contract rewritten |
| `backend/.env.example` | `TRUSTED_PROXY_IPS` semantics and the new hashing knobs |

No database migration is required: `rate_limit_events` already stores action, key digest
and timestamp; the change is which keys are used.

## 5. Login throttling, before and after

| Situation | Before | After |
|---|---|---|
| 300 failed logins for 300 unknown addresses through one proxy | `login_ip` bucket (shared) exhausted → subsequent **correct** login `429` | all `401`; correct login `200` |
| 8 failures for one account, then the right password | `429` on the 9th request even with the correct password? *No* — failures only, correct password `200` | unchanged: `401 ×8`, `429` afterwards, correct password `200` |
| Distributed flood of failures | `login_ip` reached first (300/5 min) | `login_account` (20/15 min per account) and `login_global` (5000/5 min) |
| CPU cost of a flood | unbounded concurrent Argon2 hashes | ≤ 16 concurrent, `503`+`Retry-After` beyond a 2 s queue |
| Forged `X-Forwarded-For`, no trusted proxy | ignored (socket peer used) | ignored (`trusted_client_only` buckets skipped, keys use the socket peer) |
| Verified trusted proxy | last hop used | last hop used, and per-client buckets become genuinely independent |
| Registration / forgot-password flood from one address | shared `*_ip` (60/h) and `*_global` (2000/h) lockout | address buckets only behind a verified proxy; per-email ceilings unchanged |
| Token submission (`verify-email`, `reset-password`) | per caller address (shared) | per submitted token digest |

## 6. Trust-boundary and deployment assumptions

- **Default (`TRUSTED_PROXY_IPS` empty).** Client identity is unverifiable. Login,
  registration, and recovery remain fully available to every user behind the proxy; only
  account-scoped and token-scoped counters apply, plus transient hashing back-pressure.
  This is the state the local integration environment runs in (`TRUSTED_PROXY_IPS=`).
- **Behind a verified front proxy.** Set `TRUSTED_PROXY_IPS` to the *immediate peer*
  address(es) only, i.e. the proxy that connects to the API. That proxy must overwrite —
  not append to — the client-supplied header, or must itself be the last appender. The
  value used is the last hop, so an attacker-supplied prefix is ignored.
- **Next.js proxy.** `frontend/app/api/v1/[...path]/route.ts` forwards `X-Forwarded-For`
  only when `CYBERLAB_TRUST_INBOUND_XFF=true`. With `next start` (no front proxy) the
  request has no `X-Forwarded-For`, so even if FastAPI were misconfigured to trust
  `127.0.0.1`, no address would be accepted (`trusted_client_address()` returns `None`
  when the trusted peer supplies no header).
- **Residual capacity risk.** Concurrency admission control protects CPU, not bandwidth or
  availability of the host itself. A sustained high-concurrency flood can still produce
  transient `503`s for legitimate users; that is expected back-pressure and should be
  handled at the edge (connection limits, upstream rate limiting, WAF) in any real
  deployment. This is documented, not suppressed.

## 7. Related endpoint findings

| Endpoint | Shared-address DoS before? | Treatment |
|---|---|---|
| `POST /auth/register` | Yes — `register_ip` 60/h, `register_global` 2000/h, both charged before any account work | `register_ip` now trusted-only (20/h); `register_global` removed; per-email `5/h` source + `5/h` account ceilings retained |
| `POST /auth/verification/resend` | No — already per-email (`3/h` source + `5/h` account) | unchanged |
| `POST /auth/forgot-password` | Yes — `forgot_ip` 60/h, `forgot_global` 2000/h | `forgot_ip` now trusted-only (20/h); `forgot_global` removed; per-email ceilings retained; generic response and background delivery unchanged |
| `POST /auth/verify-email` | Yes — 10/5 min keyed on the caller address | keyed on `sha256(token)` |
| `POST /auth/reset-password` | Yes — 8/5 min keyed on the caller address | keyed on `sha256(token)` |

Anti-enumeration is unchanged: registration and forgot-password return the same generic
message and shape for known and unknown addresses, duplicate registration produces no
second account, and mail delivery remains off the response path.

## 8. Regression tests added

`backend/tests/test_rate_limit_identity.py` (7 tests):

| Requirement | Test |
|---|---|
| A — real threshold | `test_three_hundred_unrelated_failures_do_not_block_a_valid_login`: 300 failures for 300 distinct unknown addresses from one shared peer, all `401`, then a correct login for a verified account returns `200` and issues a usable session |
| B — account protection | `test_repeated_failures_for_one_account_are_still_throttled`: `401 ×8` then `429`, while the correct password still returns `200` |
| C — proxy identity | `test_forged_forwarded_address_cannot_create_fresh_buckets`: no trusted proxy → rotating `X-Forwarded-For` neither evades the account ceiling nor creates a shared lockout |
| D — session security | `test_successful_login_still_issues_and_revokes_sessions`: cookie set, `/users/me` `200`, logout `204`, `/users/me` `401` |
| E — related endpoints | `test_shared_address_cannot_block_recovery_or_registration`: 80 forgot-password requests for unknown addresses then a real recovery still succeeds and sends exactly one mail; 30 registrations then a legitimate one is persisted |
| Audit / monitoring | `test_failed_login_attempts_still_audit`: `auth.login_failed` audit row and `login` rate-limit rows exist, and no `login_ip` bucket is written |
| Trusted proxy | `test_forwarded_addresses_get_independent_buckets_behind_a_trusted_proxy`: with `TRUSTED_PROXY_IPS` set, one forwarded address exhausting its bucket does not affect another forwarded address |

`backend/tests/test_postgres_integration.py` (+2):

| Requirement | Test |
|---|---|
| F — concurrency | `test_postgres_concurrent_failed_logins_respect_account_limit`: 24 concurrent failures for one account → at most 8 `401`, remaining `429`, no `5xx`, valid login still `200` |
| A on PostgreSQL | `test_postgres_shared_address_spray_cannot_block_a_valid_login`: 300 failures (real threshold) then a valid login and `/users/me` `200` |

Hash cost in these tests is replaced with a fast comparison (`verify_password_guarded` /
`hash_password_guarded` monkeypatched) so the throttling logic, not Argon2 latency, is
under test at the real request counts. The real hashing path is exercised by every other
backend test and by the live reproduction below.

## 9. Tests executed

| Gate | Result |
|---|---|
| `pytest -q` (SQLite) | **35 passed, 5 skipped** |
| `pytest -q` with `CYBERLAB_TEST_POSTGRES_URL` | **40 passed** |
| Live 300-failure spray through `localhost:3000` → Next.js proxy → FastAPI → PostgreSQL | 300 × `401` in 18.3 s, then correct login `200`, `/users/me` `200`, logout `204`, `/users/me` `401` |
| Live account throttle through the proxy | `401 ×8` then `429`; correct password `200` |
| Live forged `X-Forwarded-For` while throttled | `429 ×3` (no evasion) |
| Live forgot-password flood (80 unknown addresses, one proxy address) | all `200`; legitimate recovery `200` and exactly one mail captured |
| Live registration flood (40 distinct addresses, one proxy address) | all `202`; legitimate registration `202` |
| Live verification and reset | single use (`200` then `400` on reuse for both) |
| Frontend `npm run typecheck` / `npm run lint` | pass |
| Frontend `npm test` | 54 passed (9 files) |
| Frontend `npm run build` | pass |
| `npm audit` / `npm audit --omit=dev` | 0 / 0 |

## 10. PostgreSQL verification

- All PostgreSQL-backed tests run against throwaway databases created from
  `CYBERLAB_TEST_POSTGRES_URL` (local PostgreSQL 17, `127.0.0.1:5433`); each test creates
  and drops its own database. `alembic downgrade 0001_accounts` → `upgrade head` is still
  exercised by `test_postgres_migration_and_independent_sessions`.
- No migration was added or modified: the fix reuses `rate_limit_events`.
- Live checks ran against the isolated integration database `cyberlab_01d`. After the
  live spray the recorded actions were `login`, `login_account`, `login_global`,
  `forgot_account`, `forgot_password`, `register`, `register_account`, `verify_token`,
  `reset_password`. The newest `login_ip` row predates this change by ~6 hours, confirming
  no pre-authentication shared bucket is written any more.
- `pg_advisory_xact_lock` around the count-then-insert in `check_rate_limit` is retained,
  which is what makes Test F meaningful: 24 concurrent failures yield exactly the 8
  allowed attempts rather than racing past the ceiling.

## 11. Previously fixed findings — preserved

- Verification and reset tokens are still scrubbed from browser URLs after capture;
  token pages still send `no-store` / `no-referrer` (`frontend/__tests__/token-url-hygiene.test.tsx`).
- The Next.js proxy still rejects oversized bodies (256 KiB cap, `413`) and bounds
  streaming bodies without `Content-Length`.
- Origin/CSRF enforcement (`require_origin`) is untouched and still runs first on every
  affected endpoint.
- No authentication, session, role, MFA, or step-up logic was weakened; session creation,
  rotation, revocation and audit events are unchanged apart from the throttles described
  above.

## 12. Remaining risks

1. **Account-scoped lockout is intentional and remains.** An attacker who knows an email
   can lock *that account's* failed-login attempts for 5–15 minutes. Correct credentials
   are never blocked, and this is the recommended control (it does not scale to unrelated
   users).
2. **Hashing back-pressure produces `503` under sustained concurrency.** Bounded queueing
   protects CPU; a determined high-concurrency flood can still degrade availability.
   Edge-level controls (connection/rate limits, WAF) remain a deployment responsibility.
3. **Unverifiable client identity by default.** Without `TRUSTED_PROXY_IPS`, per-source
   abuse controls cannot distinguish clients and are therefore not enforced on shared
   buckets; all protection is account- or token-scoped. Deployments behind a proxy should
   establish the trusted-proxy chain to regain per-source throttling.
4. **`login_global` is a monitoring tripwire, not a security boundary.** At 5000 failures
   per 5 minutes it converts further failing attempts to `429`; it does not affect correct
   credentials.
5. Independent QA (Codex) re-verification is still outstanding; this report makes no claim
   that the finding is closed.

## 13. Git

| Item | Value |
|---|---|
| Branch | `codex/milestone-01d-integration` |
| Fix commit | `811cc7f` — `Remove pre-authentication login gate that allowed shared-address lockout` |
| Push status | pushed to `origin/codex/milestone-01d-integration` (PR #7 left open, not merged) |
| `main` | not modified |
| `docs/CODEX_01D_INDEPENDENT_VERIFICATION_REPORT.md` | left untracked and unmodified |
