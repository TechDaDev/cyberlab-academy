# Milestone 01D — Trusted-Proxy Client Identity Fix

Focused correction of the acceptance blocker raised by the second independent review
(Codex, `docs/CODEX_01D_INDEPENDENT_VERIFICATION_REPORT.md`, local and uncommitted).

Scope: restore a single, working trust boundary for client addresses. No new features, no
schema changes, no redesign of authentication.

This report documents the implementation and the development checks that were run. It does
**not** declare the milestone accepted; Codex performs the independent verification.

| Item | Value |
|---|---|
| Branch | `codex/milestone-01d-integration` (PR #7, not merged) |
| Previously tested commit | `14d2107cab123a745f52feb483cdbe1fe4346a4d` |
| Fix commit | `724c615` — see §12 |
| `main` | not modified |
| Codex QA report | left untracked and unmodified |

---

## 1. Confirmed root cause

Two independent defects, each sufficient to break the boundary.

### Finding A — the application could not see the immediate peer

`backend/app/run.py` started Uvicorn with `proxy_headers=<TRUSTED_PROXY_IPS non-empty>` and
`forwarded_allow_ips=<TRUSTED_PROXY_IPS>`. Uvicorn's `ProxyHeadersMiddleware` then executes
before the application:

```python
scope["client"] = (host, port)   # host taken from X-Forwarded-For
```

`backend/app/security.py:trusted_client_address()` decided trust with
`request.client.host in TRUSTED_PROXY_IPS`. After the rewrite that value is the *client*
address (`127.0.0.2` in the QA run), not the *peer* (`127.0.0.1`), so the check always
failed and returned `None`. Address-keyed buckets were consequently skipped — which is why
PostgreSQL recorded **zero** `login_ip_failures` rows in the QA reproduction. The failure
mode was "silently no identity", not "wrong identity".

Two subsystems reinterpreting the same header, one of them destroying the evidence the
other needed, is the actual design error. `TestClient` never runs the Uvicorn server stack,
so unit tests could not observe it.

### Finding B — a flag, not a trust boundary, guarded the Next.js hop

`frontend/app/api/v1/[...path]/route.ts` forwarded any inbound `X-Forwarded-For` whenever
`CYBERLAB_TRUST_INBOUND_XFF=true`. Nothing proved the request came from the sanitising
ingress, so a client that reached Next.js directly (port 3003) supplied arbitrary addresses
and got a fresh per-source bucket per attempt: nine failures against one account all
returned `401`, bypassing the 8-per-source limit. The account-wide bucket remained as a
backstop, which is why only the per-source control was lost.

## 2. Architecture selected

One owner for forwarded-address interpretation, and trust that must be *proved* at each hop.

```
client ──► sanitising ingress ──► Next.js /api/v1 proxy ──► FastAPI ──► PostgreSQL
           (overwrites XFF,        (verifies ingress        (verifies immediate
            adds ingress secret)    secret, strips else)     peer, parses one address)
```

**FastAPI owns resolution.** `app.run` now always passes `proxy_headers=False` and
`forwarded_allow_ips=None`, so `scope["client"]` is the real socket peer for the lifetime of
the request. `app.security` decides trust exactly once, from that peer, and `app.security`
is the only code that reads `X-Forwarded-For`.

**Acceptance rules** (`trusted_client_address`):

1. Immediate socket peer must be listed in `TRUSTED_PROXY_IPS` (compared canonically, so
   `::1` and `0:0:0:0:0:0:0:1` are the same proxy). Otherwise: no identity.
2. `X-Forwarded-For` must contain **exactly one** hop. Two or more hops mean at least one
   untrusted writer in the chain, so the value is discarded instead of resolved — picking a
   hop would let a client choose its identity.
3. The hop must parse as an IPv4/IPv6 literal (`ipaddress.ip_address`). Bracketed IPv6 is
   accepted; hostnames, `addr:port`, lists, and IPv6 zone ids are rejected. Values are
   canonicalised, and `::ffff:203.0.113.9` collapses to `203.0.113.9`.

**Defense in depth** (`UntrustedForwardingGuard`, ASGI middleware installed before routing):
forwarding headers (`x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-host`, `forwarded`)
are deleted from the request scope when the connection peer is not a trusted proxy. Even if
a server or plugin rewrote the peer again, an untrusted connection cannot leave a
client-asserted address for other code to misread, and the worst case degrades to "no
identity" (safe) rather than "spoofable identity".

**Fail-safe, not lockout.** When no identity resolves, address-keyed buckets
(`login_ip_failures`, `register_ip`, `forgot_ip`) are skipped, because a bucket keyed on
infrastructure shared by many users is precisely the lockout vector removed earlier.
Account- and token-scoped buckets continue to protect the endpoints.

**Next.js requires ingress authentication.** The proxy forwards `X-Forwarded-For` only when
the request carries `X-Cyberlab-Ingress-Auth` whose SHA-256 digest equals that of
`CYBERLAB_TRUSTED_INGRESS_SECRET` (`crypto.timingSafeEqual`, secret must be ≥16 chars), and
only when the forwarded value is a single IP literal (`net.isIP`). `CYBERLAB_TRUST_INBOUND_XFF`
is removed: an environment flag no longer enables trust. The secret header is never
forwarded upstream, and no secret value is ever logged.

Why this satisfies both findings:

- Finding A cannot recur through configuration: the server is not allowed to rewrite the
  peer, so the value the check reads is always the connection peer. Running the old
  `--proxy-headers` behaviour by hand degrades to "no identity" (verified in §6) instead of
  silently disabling the control.
- Finding B cannot recur through headers: identity requires possession of the ingress secret
  *and* an overwritten single-hop header. Rotating `X-Forwarded-For` on a direct connection
  yields no identity, so the socket-peer `login` bucket (8 per source+email) applies.

## 3. Files modified

| File | Change |
|---|---|
| `backend/app/run.py` | `proxy_headers=False`, `forwarded_allow_ips=None` unconditionally; documents that the app owns forwarded-address resolution |
| `backend/app/security.py` | `normalize_ip()`, canonical `trusted_proxy_addresses()`, `is_trusted_proxy()`, `socket_peer()`, `forwarded_client_address()` (single-hop only), rewritten `trusted_client_address()`, `UntrustedForwardingGuard` |
| `backend/app/main.py` | installs `UntrustedForwardingGuard` |
| `backend/tests/test_run.py` | asserts Uvicorn proxy handling is off even when `TRUSTED_PROXY_IPS` is set |
| `backend/tests/test_proxy_trust.py` | 31 resolver/guard/bucket cases (new) |
| `backend/tests/test_uvicorn_proxy_trust.py` | 5 tests against real Uvicorn processes (new) |
| `frontend/app/api/v1/[...path]/route.ts` | ingress-authenticated forwarding; `CYBERLAB_TRUST_INBOUND_XFF` removed |
| `frontend/__tests__/api-proxy.test.ts` | 8 ingress-boundary cases (was 2 flag cases) |
| `docs/ARENA_FRONTEND_API_GUIDE.md` | single-resolver contract, ingress requirements, `503` back-pressure, local vs deployed limitations |
| `docs/MILESTONE_01D_INTEGRATION_REPORT.md` | §17.1 corrected, §18 added |
| `docs/MILESTONE_01D_RATE_LIMIT_FIX_REPORT.md` | trust section corrected and marked superseded |
| `backend/.env.example`, `frontend/.env.example` | `TRUSTED_PROXY_IPS` semantics, `CYBERLAB_TRUSTED_INGRESS_SECRET` |

No model or migration change (`alembic check` → "No new upgrade operations detected").

## 4. Runtime proxy configuration used for verification

Mirrors the reviewer's topology, on a dedicated database and ports, without touching the
running development stack:

| Tier | Address | Settings |
|---|---|---|
| FastAPI | `127.0.0.1:8004` | `TRUSTED_PROXY_IPS=127.0.0.1`, `RELOAD=false`, launched via `python -m app.run`, isolated PostgreSQL DB migrated to head |
| Next.js | `127.0.0.1:3003` | `CYBERLAB_BACKEND_URL=http://127.0.0.1:8004`, `CYBERLAB_TRUSTED_INGRESS_SECRET=<32+ char>` |
| Sanitising ingress | `127.0.0.1:3004` | overwrites `X-Forwarded-For` with the socket peer, sets `X-Cyberlab-Ingress-Auth`, strips client-supplied copies |
| Clients | `127.0.0.2`, `127.0.0.3`, `127.0.0.4` | bound with `httpx.HTTPTransport(local_address=…)` |

The default local stack (`FastAPI :8000` with `TRUSTED_PROXY_IPS=` empty, `next start :3000`
without an ingress secret) was used for the no-trust regression.

## 5. Trusted-client identity behaviour (after the fix)

| Request | Identity | Address bucket |
|---|---|---|
| Peer `127.0.0.1` (trusted), `X-Forwarded-For: 203.0.113.7` | `203.0.113.7` | created |
| Peer `127.0.0.1`, `X-Forwarded-For: 203.0.113.7, 198.51.100.4` | none (ambiguous) | skipped |
| Peer `127.0.0.1`, `X-Forwarded-For: not-an-ip` | none | skipped |
| Peer `127.0.0.1`, no `X-Forwarded-For` | none | skipped |
| Peer `203.0.113.50` (untrusted), any `X-Forwarded-For` | none — header stripped by the guard | skipped |
| Peer `127.0.0.1`, `X-Forwarded-For: [2001:db8::7]` / `2001:db8::7` | `2001:db8::7` (same bucket) | created |
| Peer `127.0.0.1`, `X-Forwarded-For: ::ffff:203.0.113.9` | `203.0.113.9` | created |

## 6. Real Uvicorn integration results

`backend/tests/test_uvicorn_proxy_trust.py` starts `python -m app.run` as a subprocess with
production-style environment, waits for `/api/v1/health`, and drives it over TCP.

| Test | Result |
|---|---|
| Immediate peer preserved: one failure with `XFF: 203.0.113.7` creates exactly `sha256("login_ip_failures:203.0.113.7:")` | pass |
| Ambiguous (`a, b`), malformed, empty forwarding produce `401` but **no** address bucket | pass |
| IPv6 and bracketed IPv6 canonicalise into one bucket (2 rows) | pass |
| Two verified clients: A → 20 × `401`, 21st → `429`; B → `401`; buckets 20 / 1 | pass |
| Untrusted server (`TRUSTED_PROXY_IPS` empty) with rotated forged headers: 8 × `401`, 9th `429`, no address rows | pass |

Counter-proof that the test is meaningful: the same application started manually with the
old server configuration (`uvicorn app.main:app --proxy-headers --forwarded-allow-ips=127.0.0.1`,
`TRUSTED_PROXY_IPS=127.0.0.1`) and one failure with `XFF: 203.0.113.7` recorded
**0** `login_ip_failures` rows — exactly the reviewer's Finding A. The new suite fails in
that configuration and passes with `app.run`.

## 7. Direct-access spoofing results (Finding B)

Live, against Next.js `:3003` (built with the new proxy code) on a direct connection, i.e.
bypassing the ingress:

- nine wrong-password attempts for one account, each with a different forged
  `X-Forwarded-For` **and** a guessed `X-Cyberlab-Ingress-Auth`:
  `401, 401, 401, 401, 401, 401, 401, 401, 429`
- forged addresses recorded as buckets: **0**; the socket-peer `login` bucket enforced the
  documented 8-per-source ceiling.

Unit level (`frontend/__tests__/api-proxy.test.ts`, 8 cases): secret absent → forwarded,
wrong secret → dropped, no secret configured → dropped, multi-hop/malformed/port/empty →
dropped, IPv6 forwarded, secret header never forwarded upstream, three rotating addresses
all dropped.

## 8. Per-source throttling results (restored)

Live through the sanitising ingress (`:3004` → Next.js `:3003` → FastAPI `:8004` → PostgreSQL):

| Check | Result |
|---|---|
| Client `127.0.0.2`, 20 failures for 20 distinct emails | 20 × `401` |
| Client `127.0.0.2`, 21st failure | `429` |
| Client `127.0.0.3`, first failure (independent bucket) | `401` |
| PostgreSQL `login_ip_failures` rows | 20 for `127.0.0.2`, 1 for `127.0.0.3`, 21 total |
| Client-supplied `XFF: 9.9.9.9` + guessed ingress secret through the ingress | `401`; bucket for `9.9.9.9` = 0, for real peer `127.0.0.4` = 1 |
| Correct credentials for a verified account after that address exhausted its 20-failure bucket | `200`, session cookie set, `/users/me` `200`, logout `204`, then `401` |
| Further wrong passwords from that exhausted address | `429` (address bucket full), account-scoped bucket also charged |

## 9. Original 300-attempt regression (no-trust topology, unchanged behaviour)

Default stack (`FastAPI :8000`, `TRUSTED_PROXY_IPS=` empty, Next.js `:3000`, real Argon2):

- 300 failed logins for 300 distinct unknown emails through the Next.js proxy → **300 × `401`** in 21.7 s
- immediate correct login for an unrelated verified account → `200`
- `/users/me` → `200`, logout → `204`, `/users/me` → `401`

The shared-address lockout has not returned, and no `login_ip` bucket exists in any
configuration.

## 10. Focused automated test results

| Gate | Result |
|---|---|
| `pytest -q tests/test_proxy_trust.py` | 31 passed |
| `pytest -q tests/test_uvicorn_proxy_trust.py` | 5 passed (7.1 s, real Uvicorn) |
| `pytest -q tests/test_run.py` | 2 passed |
| `pytest -q` (SQLite) | **71 passed, 5 skipped** |
| `pytest -q` with `CYBERLAB_TEST_POSTGRES_URL` | **76 passed** |
| `alembic check` against PostgreSQL 17 | no new upgrade operations |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 60 passed (9 files) |
| `npm run build` | pass |

PostgreSQL concurrency protection (`pg_advisory_xact_lock` on count-then-insert), bounded
hashing (`503` + `Retry-After`), failure-only credential throttling, token-keyed
verify/reset limits, account-recovery protections, token URL cleanup, proxy body limits,
Origin/CSRF enforcement, Administrator MFA, last-Administrator protection and existing
authorisation checks are unchanged and covered by the suites above.

## 11. Known limitations

1. **Local HTTP is not a deployment model.** `COOKIE_SECURE=false` and loopback-only binding
   are development settings. Deployed traffic needs HTTPS, `COOKIE_SECURE=true`, and a
   network boundary that prevents clients from reaching Next.js or FastAPI directly; the
   ingress secret is only meaningful if clients cannot bypass the ingress.
2. **The ingress is a trust anchor.** Its shared secret must be generated outside version
   control, rotated like any credential, and known only to the ingress and Next.js. A leaked
   secret lets an attacker assert an arbitrary client address; it does not grant account
   access, but it does restore per-source evasion.
3. **`TRUSTED_PROXY_IPS` must list the immediate peer only.** Listing a range of clients, or
   running with `uvicorn --proxy-headers`, defeats the peer check. The guard degrades this to
   "no identity" but the control is then absent — the safe outcome, not the protected one.
4. **Single-hop only.** Deployments with a CDN in front of the sanitising ingress must have
   the ingress overwrite the header (it does, in this design); an appending proxy chain is
   rejected and address buckets stop being enforced rather than trusting an ambiguous value.
5. **Hashing back-pressure can still transiently `503`.** Capacity control protects CPU, not
   bandwidth or host availability; edge-level controls remain a deployment responsibility.
6. Independent QA re-verification is outstanding.

## 12. Git

| Item | Value |
|---|---|
| Branch | `codex/milestone-01d-integration` |
| Commit | `724c615` — code and regression tests; documentation follows in a second commit on the same branch |
| Push | pushed to `origin/codex/milestone-01d-integration`; PR #7 updated, not merged |
| `main` | not modified |
| Codex QA report | untracked, unmodified |
