# CyberLab Academy Agent Rules

## Agent responsibilities (current workflow)
- **DeepSeek** — backend engineering: FastAPI, SQLAlchemy, Alembic, API and event contracts in `shared-contracts/`.
- **Arena AI** — frontend engineering: visual design, accessibility, responsive pages and browser interactions.
- **Codex** — independent testing and security verification: focused QA of each PR, contract parity, authorization and migration checks. Codex does not implement source changes.
- **ChatGPT** — architecture and project coordination: milestone scope, phase boundaries and acceptance decisions.

Ownership is by area, not by permission: any agent may review another area, but must not
overwrite another agent's work or rewrite shared history without coordination.

## Areas and responsibility
- `frontend/` — Arena AI owns visual design, accessibility, responsive pages and browser interactions.
- `backend/` — DeepSeek owns FastAPI, PostgreSQL, Alembic, authentication, authorization and security.
- `simulation-engine/` — DeepSeek owns deterministic simulation rules; Arena may build views that consume them.
- `shared-contracts/` — DeepSeek publishes generated API and event schemas before frontend integration; Arena codes against the committed contract, never against guesses.
- `mission-content/` — Original structured scenario content; do not commit copyrighted training PDFs.

## Git rules
- Work on feature branches; use PRs into `main`.
- Do not overwrite the other agent's work or rewrite Git history.
- Keep changes limited to owned areas unless coordinated.
- Never commit credentials, secrets, real student data or environment files.
- Tests and CI must pass before merge; document migrations and any breaking API changes.
- Contract changes are additive; a breaking change requires explicit approval and a version bump.

## Authorization
Four assignable roles: student, instructor, manager, administrator.
Role is not equivalent to unconditional access: validate resource ownership/class membership and scope.
Managers can manage student/instructor users; only administrators can manage manager/administrator assignments.
A user may activate only an assigned role; the server enforces permissions for each request.
Protect last active administrator, audit privilege changes, require MFA for administrators.

## Educational content
Module 01 is introductory; no arbitrary attacks against third-party systems.
Use safe synthetic targets and evidence. The backend authoritatively records timed official assessments.
The CEH v12 course declares 20 planned modules; only supplied source material is authored.
Never invent lesson, module or mission content, and never commit proprietary training material.
