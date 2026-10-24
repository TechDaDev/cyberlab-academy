# CyberLab Academy Agent Rules

## Architecture and responsibility
- `frontend/` — Arena AI owns visual design, accessibility, responsive pages and browser interactions.
- `backend/` — Codex owns FastAPI, PostgreSQL, Alembic, authentication, authorization, grading and security.
- `simulation-engine/` — Codex owns deterministic simulation rules; Arena may build views that consume them.
- `shared-contracts/` — Codex publishes API and event schemas before frontend integration.
- `mission-content/` — Original structured scenario content; do not commit copyrighted training PDFs.

## Git rules
- Work on feature branches; use PRs into `main`.
- Do not overwrite the other agent's work or rewrite Git history.
- Keep changes limited to owned areas unless coordinated.
- Never commit credentials, secrets, real student data or environment files.
- Tests and CI must pass before merge; document migrations and any breaking API changes.

## Authorization
Four assignable roles: student, instructor, manager, administrator.
Role is not equivalent to unconditional access: validate resource ownership/class membership and scope.
Managers can manage student/instructor users; only administrators can manage manager/administrator assignments.
A user may activate only an assigned role; the server enforces permissions for each request.
Protect last active administrator, audit privilege changes, require MFA for administrators.

## Educational content
Module 01 is introductory; no arbitrary attacks against third-party systems.
Use safe synthetic targets and evidence. The backend authoritatively records timed official assessments.
