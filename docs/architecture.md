# Architecture v0.1

## Services
- Frontend: Next.js/TypeScript, UI via Arena AI.
- Backend: FastAPI/Python, PostgreSQL, Alembic; REST endpoints with OpenAPI.
- Browser simulation engine: TypeScript, deterministic sandbox content.
- Real Kali labs: deferred; isolate as separate orchestrated runtime in later milestone.

## Backend data boundaries
- Users, assigned roles, active role, verification, sessions, recovery and MFA.
- Classes and enrollments: future milestone; instructors can only access their assigned classes.
- Assessment attempts: server-authoritative start/end times; score breakdown and versioned criteria.
- Immutable-style audit events for security and grade changes.

## Milestone 01 acceptance
Registration, email verification, login/logout, recovery, profile updates, account statuses, instructor approval, role assignment/switching, last-admin protections, MFA for admin, audit logs, automated authorization tests.

## API rules
- Version APIs under /api/v1.
- Pydantic validation and versioned OpenAPI contract.
- Never trust role, user ID, timestamps or grades from client input.
- Security-sensitive operations are rate-limited and logged; no unbounded terminal execution.
