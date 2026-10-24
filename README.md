# CyberLab Academy

Mission-based cybersecurity education and simulation platform.

## Project status
Milestone 01: Identity, Access & Platform Foundation (initial architecture).

## Architecture
- `frontend/`: Next.js, TypeScript, Tailwind CSS, shadcn/ui.
- `backend/`: Python FastAPI, PostgreSQL, Alembic.
- `simulation-engine/`: TypeScript, deterministic browser simulations.
- `mission-content/`: Original, versioned module/mission data.
- `shared-contracts/`: OpenAPI and shared JSON schemas.
- `infrastructure/`: Local development and deployment configuration.
- `docs/`: Architecture, roles, security, and implementation plans.

## Workflow
Codex owns infrastructure, backend, contracts, security and tests. Arena AI owns visual design and frontend interaction. Changes use feature branches and PRs, not direct pushes to main.

## Important
The training environment must use only authorized synthetic simulation targets. Do not publish or reproduce source CEH PDF material without licensing review.
