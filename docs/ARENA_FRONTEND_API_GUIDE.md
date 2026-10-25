# CyberLab Academy account API guide for Arena AI

This guide covers implemented Milestone 01B routes. Use [the OpenAPI contract](../shared-contracts/openapi.json) for exact field types. The backend makes all role and permission decisions. Frontend role checks only control presentation.

## Transport and session rules

Base path: `/api/v1`. Local API: `http://127.0.0.1:8000`. Send JSON request bodies. Browser requests must use `credentials: "include"`. Login sets an `HttpOnly` cookie named `cyberlab_session`; frontend code cannot read it. Protected routes have the `APIKeyCookie` security scheme in OpenAPI.

Every state-changing request must include an `Origin` accepted by `ALLOWED_ORIGINS`. Browsers send this header automatically. A missing or untrusted Origin returns 403. The session cookie is `Secure` by default. Local HTTP uses `COOKIE_SECURE=false`; production needs HTTPS and `COOKIE_SECURE=true`. Account responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Start the API with `python -m app.run`. It binds to `127.0.0.1:8000` by default, never lets Uvicorn rewrite the client address, and resolves `X-Forwarded-For` itself (see "Who resolves the client address" below). Set `ALLOWED_HOSTS` to the API hostnames and `ALLOWED_ORIGINS` to exact frontend origins.

## Authentication state machine

1. Registration creates a Student account with `email_verified=false`. It can also create a pending instructor application. The 202 response is intentionally generic for new and duplicate email addresses.
2. A verification email links to frontend route `/verify-email?token=...`. Submit that token to `POST /auth/verify-email`. A replacement request invalidates the previous token.
3. A user may log in before verification to manage their account. Future formally assessed mission routes must use the backend's `require_verified_email` dependency. No assessed mission endpoint exists yet.
4. Manager or Administrator approval grants Instructor after email verification. Approval revokes the applicant's existing sessions. Rejection grants nothing.
5. Each login creates a session with Student active. Role switching changes only that session and rotates its cookie. Existing sessions keep their own active role.
6. Manager activation needs password authentication within five minutes. Administrator activation needs recent MFA. `MANAGER_MFA_REQUIRED=true` also requires MFA for Manager.
7. Password reset, password change, verified email change, suspension, and role grant or revocation invalidate affected sessions. Logout revokes one session; logout-all revokes every session.

## Public endpoints

| Method and path | JSON request | Success | Main errors |
|---|---|---|---|
| `POST /auth/register` | `full_name`, `email`, `password`, `password_confirmation`, optional `instructor_application` | 202 generic `Message` | 403, 422, 429 |
| `POST /auth/verification/resend` | `email` | 200 generic `Message` | 403, 429 |
| `POST /auth/verify-email` | `token` | 200 `Message` | 400, 403, 409, 429 |
| `POST /auth/login` | `email`, `password` | 200 `UserPublic`; sets cookie | 401, 403, 429 |
| `POST /auth/forgot-password` | `email` | 200 generic `Message` | 403, 429 |
| `POST /auth/reset-password` | `token`, `password`, `password_confirmation` | 200 `Message`; revokes sessions | 400, 403, 422, 429 |

Passwords must be 12–128 characters. They cannot contain the email name or full name. Verification tokens expire after 60 minutes; reset tokens expire after 30 minutes. Both work once, and concurrent submission of the same token allows exactly one success. Only SHA-256 token digests are stored. Forgot-password and registration responses do not reveal whether an address exists.

Abuse controls combine a trustworthy client identity with an account key. Only failed logins consume the credential throttles, so a caller who cannot authenticate cannot lock unrelated accounts out. There is **no counted pre-authentication bucket** on login.

| Endpoint | Buckets |
|---|---|
| `POST /auth/login` | failures only: 8 per source+email per 5 min, 20 per email per 15 min, 20 per verified client address per 5 min (trusted proxies only), 5000 failures site-wide per 5 min. Nothing is counted before the credentials are checked, so a correct password always logs in. Excessive concurrent hashing returns `503` with `Retry-After`. |
| `POST /auth/register` | 5 per source+email per hour, 5 per email per hour, 20 per verified client address per hour (trusted proxies only) |
| `POST /auth/verification/resend` | 3 per source+email per hour, 5 per email per hour |
| `POST /auth/forgot-password` | 3 per source+email per hour, 5 per email per hour, 20 per verified client address per hour (trusted proxies only) |
| `POST /auth/verify-email`, `POST /auth/reset-password` | 10 / 8 submissions per presented token per 5 min |

A limit returns `429` with a generic `detail`; frontends should back off and must not treat `429` as proof that an account exists. A `503` from login means hashing capacity is saturated: retry after the `Retry-After` delay (it is not a credential failure and must not be shown as one).

### Who resolves the client address

Exactly one component resolves a client identity: `app.security.trusted_client_address()`. Uvicorn's own proxy handling is **disabled** (`app.run` passes `proxy_headers=False`, `forwarded_allow_ips=None`), so `request.client` is always the real socket peer and the application can check it. `TRUSTED_PROXY_IPS` lists *immediate peers* that are allowed to speak for a downstream client.

Acceptance rules, all enforced in the application:

1. The immediate socket peer must be listed in `TRUSTED_PROXY_IPS`; otherwise no client identity exists.
2. `X-Forwarded-For` must contain **exactly one** address (the trusted ingress overwrites it). Multiple hops mean at least one untrusted writer, so the whole value is discarded rather than guessing a hop.
3. The value must be a valid IPv4/IPv6 literal (bracketed IPv6 allowed; ports, hostnames, zone ids and lists rejected) and is canonicalised, so `::1`, `0:0:0:0:0:0:0:1` and `[::1]` are one identity and `::ffff:203.0.113.9` collapses to `203.0.113.9`.
4. Forwarding headers from an unlisted peer are stripped by `UntrustedForwardingGuard` before routing, so no other code can read a client-asserted address.

When no identity resolves, address-keyed buckets (`login_ip_failures`, `register_ip`, `forgot_ip`) are **skipped** rather than keyed on the shared peer address: that is a deliberate fail-safe, because a bucket keyed on infrastructure shared by many users is the lockout vector this design removes. Account- and token-scoped buckets keep working, so the endpoints remain protected and available.

**Deploying an ingress.** Forwarded identity is only produced when the ingress is authenticated. The Next.js proxy forwards `X-Forwarded-For` solely when the request also carries `X-Cyberlab-Ingress-Auth` matching `CYBERLAB_TRUSTED_INGRESS_SECRET` (constant-time compare, minimum 16 characters). The ingress must **overwrite** both headers, never append, and the secret must stay outside version control. Without the secret — or with a direct connection to Next.js, a guessed secret, a multi-address value, or a spoofed header — no forwarding header reaches FastAPI, so a client cannot invent a new identity and cannot reset its own throttle bucket.

Chain: `client → sanitising ingress (overwrites X-Forwarded-For, adds secret) → Next.js /api/v1 proxy (verifies secret, strips otherwise) → FastAPI (verifies immediate peer, parses one address) → PostgreSQL counters`.

Local note: `next start` does not add `X-Forwarded-For`, and `COOKIE_SECURE=false` means plain HTTP. That is acceptable only for loopback development; deployed traffic needs HTTPS, `COOKIE_SECURE=true`, and a network boundary that stops clients from reaching Next.js or the API directly, bypassing the ingress.

Local mail provider `dev_capture` stores private mode-0600 JSON messages in `MAIL_CAPTURE_DIR` (default `/tmp/cyberlab-mail`). No public API reads those files. For delivery, configure `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, and `FRONTEND_URL`. Production mode rejects the capture provider. Frontend routes `/verify-email` and `/reset-password` must read the link token and submit it to the corresponding API route, then remove the token from the visible URL and history (`history.replaceState`) as soon as it has been captured. Both routes are served with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

The same-origin proxy also refuses request bodies larger than `CYBERLAB_MAX_PROXY_BODY_BYTES` (default 256 KiB) with `413 {"code":"BODY_TOO_LARGE"}` before contacting FastAPI.

## Authenticated account endpoints

| Method and path | JSON request | Success and effect |
|---|---|---|
| `GET /users/me` | none | 200 `UserPublic`, including current session role |
| `PATCH /users/me` | `full_name` | 200 `UserPublic` |
| `GET /users/me/roles` | none | 200 assigned role list |
| `POST /users/me/password` | `current_password`, `new_password`, `new_password_confirmation` | 204; all sessions revoked |
| `POST /users/me/email` | `new_email`, `password` | 200 generic `Message`; verification sent to new address |
| `POST /auth/active-role` | `role` | 200 `UserPublic`; cookie rotated |
| `POST /auth/reauthenticate` | `password`, optional `mfa_code` | 200 `UserPublic`; cookie rotated; refreshes step-up window |
| `GET /users/me/sessions` | none | 200 `SessionPublic[]` |
| `DELETE /users/me/sessions/{session_id}` | none | 204; own session only |
| `POST /auth/logout` | none | 204; current cookie revoked and deleted |
| `POST /auth/logout-all` | none | 204; all sessions revoked |
| `POST /auth/mfa/enroll` | `password` | 200 `MFAEnrollResponse` with secret and QR URI; needs authentication within five minutes |
| `POST /auth/mfa/confirm` | `code` | 200 `MFARecoveryCodes`; eight codes shown once |

`UserPublic` has `id`, `full_name`, `email`, `roles`, `active_role`, `email_verified`, and `created_at`. It contains no password hash or token. `SessionPublic` has `id`, `active_role`, `created_at`, `expires_at`, `current`, and `mfa_verified`.

For MFA, show the enrollment URI as a QR code. Ask for a current six-digit TOTP. Give recovery codes to the user once; the API cannot retrieve them later. A recovery code may be submitted as `mfa_code` during reauthentication and works once. Enrollment requires the current password and rotates the session cookie; confirming enrollment revokes every other session for that account. TOTP secrets are encrypted using `MFA_ENCRYPTION_KEY`; recovery code hashes are stored. Administrator APIs require an active Administrator session with MFA.

## Manager and Administrator endpoints

All routes below require active Manager or Administrator role. Mutations need authentication within five minutes; Administrator mutations also need recent MFA. Managers can affect only Student and Instructor accounts. Managers cannot view privileged accounts or grant, revoke, suspend, or reactivate Manager or Administrator privileges.

| Method and path | JSON request or query | Success |
|---|---|---|
| `GET /admin/users` | Optional `search`, `role`, `active`; up to 100 results | `AdminUserPublic[]` |
| `POST /admin/users/{user_id}/suspend` | `reason` | `AdminUserPublic`; target sessions revoked |
| `POST /admin/users/{user_id}/reactivate` | `reason` | `AdminUserPublic` |
| `POST /admin/users/{user_id}/roles` | `role`, `reason` | `AdminUserPublic`; target sessions revoked |
| `DELETE /admin/users/{user_id}/roles/{role}` | `reason` JSON body | `AdminUserPublic`; target sessions revoked |
| `GET /admin/instructor-applications` | Optional `status`: `pending`, `approved`, `rejected` | `InstructorRequestPublic[]` |
| `POST /admin/instructor-applications/{application_id}/approve` | `reason` | `InstructorRequestPublic`; Instructor granted |
| `POST /admin/instructor-applications/{application_id}/reject` | `reason` | `InstructorRequestPublic`; no grant |

`AdminUserPublic` includes `is_active` and omits account-wide active role. `InstructorRequestPublic` includes status, decision time, actor, and reason. A reviewer cannot decide their own application. The final active Administrator cannot be suspended or lose Administrator. PostgreSQL serializes Administrator mutations for concurrent protection.

## Errors and frontend handling

FastAPI errors use `{"detail": ...}`. Validation failures provide a `detail` list. Handle 400 for invalid, expired, or reused tokens; 401 for missing/revoked session or invalid credentials; 403 for role, MFA, or Origin rejection; 404 for missing records; 409 for conflicts and last-Administrator protection; 422 for invalid input; 429 for rate limits; and 503 when MFA encryption is not configured.

After login or role switch, refresh `/users/me`. On 401, clear frontend session state and show sign-in. Do not immediately retry 429. Keep passwords, raw mail tokens, TOTP secrets, recovery codes, and cookies out of analytics and logs.

## Local Administrator bootstrap and limits

A local operator runs `cd backend && .venv/bin/python -m app.bootstrap_admin --email ... --full-name ...`. The command reads the password twice through a hidden prompt, requires `MFA_ENCRYPTION_KEY`, and refuses repeat bootstrap. The operator then signs in, enrolls and confirms TOTP, and activates Administrator. No public Administrator signup exists.

This contract covers account screens. No class, mission, assessment, or instructor teaching resource API exists yet. Do not invent those routes. SMTP, HTTPS, trusted proxy settings, and independent security review remain deployment work. See [Milestone 01B report](MILESTONE_01B_REPORT.md) for verification evidence.
