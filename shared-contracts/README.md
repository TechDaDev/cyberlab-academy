# Shared Contracts

The backend exports the authoritative OpenAPI document here. Frontend work (Arena AI) targets
the committed contract — do not guess endpoint names or response shapes.

## Current contract
- `openapi.json` — generated from the running FastAPI application, API version **0.3.0**.
  Additive over the 0.2.0 account contract: 15 catalog paths, no changes to existing ones.
- `CYBERLAB_MILESTONE_02A_API_PROPOSAL.yaml` — the design proposal for the catalog routes.
  It is a design document, not a live contract; `openapi.json` wins where the two differ.

## Regenerating
From `backend/`:

```bash
python scripts/export_openapi.py
```

The exporter writes sorted keys and two-space indentation so diffs stay reviewable.
`backend/tests/test_milestone_02a_catalog.py::test_openapi_contract_matches_the_running_application`
fails if the committed file drifts from the application, so regenerate and commit together
with any route or schema change.

## Rules
- Contract changes are additive; a breaking change needs explicit approval and a version bump.
- Keep identifiers, enums and error shapes consistent with the existing account endpoints.
- Never commit tokens, keys or real user data into a contract example.
