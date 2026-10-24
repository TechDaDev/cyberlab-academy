# Milestone 01C Frontend Report — CyberLab Academy

- **Milestone:** `01C` — Frontend Foundation, Authentication Suite, Account Security & Role Dashboards
- **Working Branch:** `arena/milestone-01c-frontend` (branched from `codex/milestone-01b-accounts` at `155f0db`)
- **Target PR Base Branch:** `codex/milestone-01b-accounts`
- **Authoritative Backend Contract:** `shared-contracts/openapi.json` (OpenAPI `3.1.0`, API `v0.2.0`)
- **Ownership Scope Verified:** `frontend/**` and `docs/MILESTONE_01C_FRONTEND_REPORT.md` only (`backend/**` and `shared-contracts/**` untouched)

---

## 1. Executive Summary

Milestone 01C delivers the complete CyberLab Academy web frontend in `frontend/` using Next.js 16 (App Router), React 19, strict TypeScript, Tailwind CSS, `shadcn/ui` primitives, React Hook Form, Zod, Lucide icons, and Recharts.

The interface establishes a cohesive **SOC / Cybersecurity Simulation** visual identity (midnight navy `#070D19` canvas, slate/charcoal elevated panels, cyan/electric-blue primary accents, semantic emerald/amber/red status indicators, and dark-mode default with optional light mode) while adhering strictly to the Milestone 01B session, CSRF/Origin, MFA, and role-governance rules:

1. **Zero client-side token or secret storage:** Authentication relies exclusively on the backend's `HttpOnly` `cyberlab_session` cookie (`credentials: "include"`). Passwords, session tokens, verification/reset tokens, TOTP secrets, and MFA recovery codes are never written to `localStorage` or `sessionStorage` (only optional remembered login email and UI theme preference use `localStorage`).
2. **Same-origin `/api/v1/[...path]` proxy:** Forwarded server-side to `CYBERLAB_BACKEND_URL` (default `http://127.0.0.1:8000`) while preserving `Cookie`, `Set-Cookie`, `Origin`, `Sec-Fetch-*`, `Cache-Control: no-store`, and `Referrer-Policy: no-referrer`.
3. **Strict contract fidelity:** No uncontracted API endpoints were invented. Student and Instructor curriculum/mission panels are explicitly badged as **Demonstration Data**, and future platform capabilities (such as MFA disable/rotation, server-backed notifications, and Milestone 02 simulation APIs) are explicitly marked as unavailable/planned.

---

## 2. Directory & Route Architecture

### Modular Frontend Structure (`frontend/`)

- `app/` — Next.js App Router pages, layouts, and `/api/v1/[...path]/route.ts` proxy
- `components/ui/` — 15 accessible `shadcn/ui` primitives (`button`, `input`, `textarea`, `label`, `card`, `badge`, `alert`, `dialog`, `dropdown-menu`, `tabs`, `checkbox`, `switch`, `separator`, `skeleton`, `toaster`)
- `components/layout/` — `app-shell.tsx`, `backend-mode-bar.tsx`, `breadcrumbs.tsx`, `notification-center.tsx`, `theme-toggle.tsx`
- `components/shared/` — `cyber-logo.tsx`, `demo-data-banner.tsx`, `planned-feature-card.tsx`, `password-strength-checklist.tsx`, `confirm-reason-dialog.tsx`, `states.tsx`
- `features/auth/` — Zod validation schemas, `AuthProvider`, `ReauthModal` step-up flow, login, registration, single-use email verification, forgot-password, and reset-password views
- `features/roles/` — Role metadata, navigation definitions, `RoleSwitcher`, and `RoleRouteGuard`
- `features/profile/` — Profile name & email change, password update, active session management, and TOTP MFA enrollment/confirmation
- `features/admin/` — Live `/api/v1/admin/*` user/role/status directory and Instructor application review queue
- `features/dashboards/{student,instructor,manager,admin}/` — Four distinct role-specific operational workspaces
- `features/landing/` — Public hero and interactive 3-tab SVG cyber range topology preview
- `lib/api/` — Typed API modules (`auth.ts`, `users.ts`, `admin.ts`), error parser with token redaction (`errors.ts`), client (`client.ts`), and opt-in Cloud Preview Demo Adapter (`preview-demo-adapter.ts`)
- `lib/types/` — Exact TypeScript mirrors of `shared-contracts/openapi.json`
- `__tests__/` — Automated Vitest + React Testing Library test suites

### Route Map

| Route | Access | Summary |
| --- | --- | --- |
| `/` | Public | Marketing & platform architecture landing page with interactive SVG cyber range preview |
| `/login` | Public | Email + password sign-in, visibility toggle, remembered email convenience, rate-limit/error states |
| `/register` | Public | Student registration + optional Instructor application checkbox, live password policy checklist, generic `202 Accepted` confirmation |
| `/verify-email` | Public | Reads `?token=...` and submits `POST /api/v1/auth/verify-email` (StrictMode-deduplicated), handles `400`/`409`/`429`, and offers verification resend |
| `/forgot-password` | Public | Enumeration-safe password reset request (`POST /api/v1/auth/forgot-password`) |
| `/reset-password` | Public | Reads `?token=...` and submits `POST /api/v1/auth/reset-password` with password confirmation |
| `/dashboard` | Protected | Redirects authenticated users to `/dashboard/{active_role}` |
| `/dashboard/student` | Protected (`student`) | Live user/auth identity + explicitly labeled synthetic curriculum, lab missions, Recharts telemetry, and achievements |
| `/dashboard/instructor` | Protected (`instructor`) | Live user/auth identity + explicitly labeled synthetic cohorts, assignments, mission completion charts, and student performance |
| `/dashboard/manager` | Protected (`manager` / `administrator`) | Live `/api/v1/admin/*` Student & Instructor management, Instructor application approvals/rejections, suspend/reactivate, and role grant/revoke (strictly excludes Manager/Admin controls) |
| `/dashboard/admin` | Protected (`administrator`) | Distinct Security Control Center with live `/api/v1/admin/*` full user & Manager/Admin role governance, MFA step-up controls, last-Admin `409` safeguards, session posture, and marked planned settings |
| `/settings/profile` | Protected | Edit full name (`PATCH /users/me`), request email change (`POST /users/me/email`), inspect `GET /users/me/roles`, and switch active role |
| `/settings/security` | Protected | Change password (`POST /users/me/password`) with immediate session revocation handling |
| `/settings/sessions` | Protected | Inspect active sessions (`GET /users/me/sessions`), revoke individual sessions (`DELETE`), or sign out everywhere (`POST /auth/logout-all`) |
| `/settings/mfa` | Protected | Enroll TOTP MFA (`POST /auth/mfa/enroll`), scan client-rendered SVG QR code, confirm 6-digit code (`POST /auth/mfa/confirm`), view/copy/download 8 one-time recovery codes in memory only |

---

## 3. Feature Classification Matrix

To maintain complete transparency between real backend persistence, labeled demonstration views, and future milestones, every capability is categorized below.

### A. Fully Implemented & Real Backend-Integrated Features

Tested end-to-end through Next.js `/api/v1/[...path]` against a live Uvicorn + SQLite FastAPI instance running `codex/milestone-01b-accounts`:

| Capability | Contracted FastAPI Endpoint(s) | Frontend Behavior Verified |
| --- | --- | --- |
| Backend health probe | `GET /api/v1/health` | `AuthProvider` & `BackendModeBar` verify live backend reachability |
| Student registration + optional Instructor request | `POST /api/v1/auth/register` (`202`) | Enforces 2–160 char name, 12–128 char password, common/personal-substring checks, confirmation match; handles generic `202` without assuming account creation |
| Single-use email verification & resend | `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/verification/resend` | Deduplicates single-use token consumption under React 19 StrictMode; handles `200`, `400` expired/replayed, `409` email conflict, and `429` rate limit |
| Session login & logout | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all` | Uses `HttpOnly; SameSite=Lax` `cyberlab_session` cookie; clears local auth state on logout or `401` |
| Enumeration-safe password recovery | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` | Respects generic non-enumerating responses; handles server-side session revocation after reset |
| Profile, email & password management | `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `POST /api/v1/users/me/email`, `POST /api/v1/users/me/password` | Updates profile name, triggers verification-gated email change, and redirects cleanly to `/login` when password change revokes sessions (`204`) |
| Assigned role inspection & active-role switching | `GET /api/v1/users/me/roles`, `POST /api/v1/auth/active-role` | `RoleSwitcher` shows **only** assigned roles, switches `active_role`, refreshes `GET /api/v1/users/me`, and routes to the active dashboard |
| Step-up reauthentication (Password + MFA) | `POST /api/v1/auth/reauthenticate` | `ReauthModal` intercepts `403` (`Recent authentication required`, `Recent MFA required`, `Administrator MFA required`), collects password + TOTP/recovery code when required, and retries the blocked action |
| Active session inspection & revocation | `GET /api/v1/users/me/sessions`, `DELETE /api/v1/users/me/sessions/{session_id}` | Displays current vs other sessions, MFA-verified badge, creation/expiry timestamps, and individual revocation |
| TOTP MFA enrollment & confirmation | `POST /api/v1/auth/mfa/enroll`, `POST /api/v1/auth/mfa/confirm` | Verifies current password (triggering step-up if session >5m old), renders `otpauth_uri` QR SVG locally in browser, confirms 6-digit TOTP, and presents 8 recovery codes once in memory only |
| Manager & Administrator user governance | `GET /api/v1/admin/users`, `POST .../suspend`, `POST .../reactivate`, `POST .../roles`, `DELETE .../roles/{role}` | Live search/role/status filtering, mandatory 3–500 char audit reason dialogs, Manager scope boundary enforcement (Student/Instructor only), and `409` last-Administrator continuity alert |
| Instructor application review queue | `GET /api/v1/admin/instructor-applications`, `POST .../approve`, `POST .../reject` | Filter by `pending`/`approved`/`rejected` and approve/reject with mandatory audit reason |

### B. Demonstration-Only UI Features (Explicitly Labeled)

- **Landing Page Interactive Range Preview (`/`):** Original client-side SVG/CSS cyber range topology (Reconnaissance, Web Defense, SOC Incident Triage) illustrating the platform's pedagogical model without proprietary third-party course graphics.
- **Student Dashboard Curriculum & Telemetry (`/dashboard/student`):** Real `GET /api/v1/users/me` identity header paired with an explicit `DemoDataBanner` and `Demo Telemetry` badges for module progress, assigned sandbox missions, skill readiness charts, recent lab events, and achievements.
- **Instructor Dashboard Cohort & Assignment Analytics (`/dashboard/instructor`):** Real `GET /api/v1/users/me` instructor profile paired with an explicit `DemoDataBanner` and `Demo Telemetry` badges for active classes, enrolled student rosters, mission completion charts, and grading queue previews.
- **Opt-In Cloud Preview Demo Adapter (`lib/api/preview-demo-adapter.ts`):** Inactive by default (`apiMode = "live"`). When local FastAPI (`127.0.0.1:8000`) is unreachable in a standalone cloud preview, reviewers can opt in via `BackendModeBar` to test all four roles (including MFA step-up code `246810` and `409` last-Admin protection) against an isolated in-memory store with persistent banner labeling.

### C. Unimplemented / Planned Backend Features (Visibly Marked, Never Simulated)

Per `shared-contracts/openapi.json` v0.2.0, the following backend endpoints do not yet exist and are explicitly marked with `PlannedFeatureCard` notices rather than fake mutations:

- **MFA Disable, TOTP Rotation & Recovery Code Regeneration** (noted on `/settings/mfa`)
- **Server-Persisted Notification Inbox** (navbar `NotificationCenter` surfaces live session/verification state notices and labels persistent cross-device notifications as Milestone 02+)
- **Curriculum, Cohort, Lab Provisioning, Mission Grading & Assessment APIs** (marked across Student, Instructor, and Manager dashboards for Milestone 02+)
- **Global Platform Configuration, Audit Log Export & Retention Policy Controls** (marked as `Unavailable` / `Milestone 02+` in the Administrator Control Center)

---

## 4. Verification & Test Results

### Static Analysis, Automated Unit/Integration Tests & Production Build

Executed in `/home/user/cyberlab-academy/frontend`:

1. **`npm run typecheck` (`tsc --noEmit`):** Passed with **0 errors**.
2. **`npm run lint` (`eslint .` with Next.js 16 + React 19 Compiler rules):** Passed with **0 errors and 0 warnings**.
3. **`npm test` (`vitest run`):** Passed **4/4 test suites (15/15 tests)** covering:
   - Login validation and remembered-email `localStorage` isolation (verifying passwords and tokens are never stored)
   - Registration validation (password length, common-password rejection, email local-part / full-name exclusion, confirmation match, optional `instructor_application`, and generic HTTP `202` handling)
   - Single-use `/verify-email` expired/invalid token handling + resend workflow, `/forgot-password` enumeration-safe messaging, and `/reset-password` completion
   - `RoleSwitcher` assigned-only role filtering, `POST /auth/active-role` + `GET /users/me` refresh, `AuthenticatedLayout` `/login?next=...` redirect, and `RoleRouteGuard` unauthorized blocking
   - Manager permission visibility (`UserDirectoryPanel` with `actorRole="manager"` never renders Manager or Administrator filter/grant/mutation controls)
   - Administrator MFA step-up modal (`403 Recent MFA required` -> `POST /auth/reauthenticate` with password + MFA code -> automatic retry)
   - MFA QR enrollment, memory-only recovery code display (never stored in `localStorage`), and explicit MFA-disable unavailability notice
   - `401` session expiration state clearing, FastAPI `422`/`409`/`429` error parsing + raw token redaction, and `LoadingState` / `EmptyState` / `ErrorState` components
4. **`npm run build` (`next build`):** Compiled all **18 App Router routes** cleanly with `0` warnings/errors; `npm audit --omit=dev` reported **0 critical / 0 high** vulnerabilities.

### Live End-to-End FastAPI Integration Verification

Verified against the unmodified `backend/` FastAPI application (`codex/milestone-01b-accounts`) running on `http://127.0.0.1:8000` with Alembic migrations (`0001_accounts` -> `0002_account_security`) applied to an isolated `/tmp` SQLite database and accessed exclusively through the Next.js server (`http://localhost:3000/api/v1/*`):

- All 16 frontend HTML pages + `GET /api/v1/health` returned `200 OK`.
- `POST /api/v1/auth/register` (`202 Accepted`) -> captured verification token -> `POST /api/v1/auth/verify-email` (`200 OK`) -> token replay rejected (`400 Bad Request`).
- `POST /api/v1/auth/login` (`200 OK`) issued `HttpOnly; SameSite=Lax` `cyberlab_session` cookie -> `GET /api/v1/users/me` (`200`), `PATCH /api/v1/users/me` (`200`), `GET /api/v1/users/me/roles` (`200`), `GET /api/v1/users/me/sessions` (`200`).
- `POST /api/v1/auth/forgot-password` (`200`) + `POST /api/v1/auth/reset-password` (`200`) revoked active session (`GET /api/v1/users/me` -> `401 Unauthorized`).
- Bootstrapped Administrator enrolled TOTP MFA (`POST /api/v1/auth/mfa/enroll` `200` + `POST /api/v1/auth/mfa/confirm` `200`), completed MFA step-up (`POST /api/v1/auth/reauthenticate` `200`), switched active role (`POST /api/v1/auth/active-role` `200`), approved pending Instructor application (`200`), granted `manager` role (`200`), and verified `DELETE /api/v1/admin/users/{id}/roles/administrator` returned `409 Cannot remove last active administrator`.
- Manager logged in, switched active role to `manager` (`200`), verified `GET /api/v1/admin/users` excluded Manager/Administrator accounts, suspended and reactivated a Student/Instructor account (`200`), and confirmed `403 Forbidden` on privileged role escalation.

---

## 5. Known Issues, Constraints & Git / PR Notes

1. **Cross-origin iframe previews vs local `SameSite=Lax` cookies:** In embedded third-party browser iframes without a local FastAPI instance on `127.0.0.1:8000`, browsers partition or block `SameSite=Lax` cookies and send the cloud preview's dynamic `Origin` rather than `http://localhost:3000`. Use **Enable Preview Demo Mode** in the top `BackendModeBar` when inspecting UI flows inside a cloud preview, and run `http://localhost:3000` + `http://127.0.0.1:8000` locally for real cookie/database persistence.
2. **Step-up `mfa_code` preservation for Administrators:** In `backend/app/routes_auth.py`, calling `POST /api/v1/auth/reauthenticate` *without* `mfa_code` clears `session.mfa_verified_at` and downgrades an active `administrator` session to `student`. The frontend `ReauthModal` accounts for this by always requiring `mfa_code` whenever the user's active or target role is `administrator`.
3. **Remote push & Pull Request creation:** This sandbox environment does not have GitHub push credentials or a GitHub connector configured. All work is committed cleanly on local branch `arena/milestone-01c-frontend` (based on `codex/milestone-01b-accounts`, with zero changes outside `frontend/` and `docs/MILESTONE_01C_FRONTEND_REPORT.md`). To push and open the PR without auto-merging:

```bash
git push -u origin arena/milestone-01c-frontend
gh pr create \
  --base codex/milestone-01b-accounts \
  --head arena/milestone-01c-frontend \
  --title "feat(frontend): Milestone 01C auth, MFA, account settings & role dashboards" \
  --body-file docs/MILESTONE_01C_FRONTEND_REPORT.md
```
