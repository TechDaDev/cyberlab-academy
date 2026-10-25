# Milestone 02A — Academic Catalog Backend Report

- **Date:** 2026-10-25
- **Branch:** `deepseek/milestone-02a-catalog` (based on `main` @ `a198e5c`)
- **Owner:** DeepSeek (backend engineering)
- **Specifications:** `docs/CYBERLAB_MILESTONE_02_ARCHITECTURE.md`, `shared-contracts/CYBERLAB_MILESTONE_02A_API_PROPOSAL.yaml`
- **Scope:** Phase 02A only. No cohorts/enrollments (02B), no progress tracking (02C), no executable
  missions, timers or grading.

Independent verification is Codex's responsibility. Nothing here claims production readiness.

---

## 1. Delivered

| Deliverable | Location |
|---|---|
| Models | `backend/app/models.py` — `Course`, `CourseModule`, `ModuleLesson`, `LessonObjective`, `LearningResource`, `ContentStatus`, `ResourceType` |
| Migration | `backend/alembic/versions/0003_academic_catalog.py` (`0002_account_security` → `0003_academic_catalog`, with downgrade) |
| Schemas | `backend/app/schemas_catalog.py` |
| Routes | `backend/app/routes_catalog.py` (15 endpoints) |
| Seed | `backend/app/seed_catalog.py` (`python -m app.seed_catalog`) |
| Contract exporter | `backend/scripts/export_openapi.py` |
| Contract | `shared-contracts/openapi.json` — API 0.3.0, 42 paths |
| Tests | `backend/tests/test_milestone_02a_catalog.py`, `backend/tests/test_postgres_catalog.py` |
| Docs | `AGENTS.md`, `README.md`, `shared-contracts/README.md`, `docs/ARENA_FRONTEND_API_GUIDE.md`, this report |

## 2. Endpoints implemented

All under `/api/v1`, cookie-authenticated, `Cache-Control: no-store`.

### Published catalog reads (any authenticated role)

| Method | Path | Notes |
|---|---|---|
| GET | `/courses` | `limit` 1–100 (default 30), `offset` ≥ 0; published only; returns `PageCourses` with `planned_module_count` and `published_module_count` |
| GET | `/courses/{course_id}` | `404` when unpublished or missing |
| GET | `/courses/{course_id}/modules` | published modules of a published course, ordered by `sequence` |
| GET | `/modules/{module_id}` | `404` unless module *and* course published (draft preview only for content managers) |
| GET | `/modules/{module_id}/lessons` | `LessonSummary[]` — metadata only, body never included |
| GET | `/lessons/{lesson_id}` | `LessonDetail` (body, objectives, resources) — content managers only in 02A |

### Content management (active Manager or Administrator, `Origin` + recent step-up)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/courses` | all statuses, including drafts |
| POST | `/admin/courses` | `201`, always creates a draft |
| PATCH | `/admin/courses/{course_id}` | title/summary/planned count; bumps `content_version` |
| POST | `/admin/courses/{course_id}/publish` | draft → published |
| POST | `/admin/courses/{course_id}/modules` | `201` draft module |
| PATCH | `/admin/modules/{module_id}` | edit / re-sequence |
| POST | `/admin/modules/{module_id}/publish` | requires published course + ≥1 published lesson |
| POST | `/admin/modules/{module_id}/lessons` | `201` draft lesson with objectives/resources |
| PATCH | `/admin/lessons/{lesson_id}` | edit, bumps `content_version` |
| POST | `/admin/lessons/{lesson_id}/publish` | requires non-empty body |

Publication is always an explicit action; no request body accepts `status`, `published_at`,
`content_version` or an actor id.

## 3. Database changes (migration `0003_academic_catalog`)

| Table | Key columns | Constraints |
|---|---|---|
| `courses` | `code`, `title`, `summary`, `edition`, `planned_module_count`, `status`, `content_version`, `created_by`, `created_at`, `updated_at`, `published_at` | unique `code`; `planned_module_count > 0`; `status IN (draft, published, archived)` |
| `course_modules` | `course_id`, `sequence`, `title`, `summary`, `status`, timestamps | unique `(course_id, sequence)`; `sequence >= 1`; status check |
| `module_lessons` | `module_id`, `sequence`, `title`, `body_markdown`, `status`, `content_version`, timestamps | unique `(module_id, sequence)`; `sequence >= 1`; status check |
| `lesson_objectives` | `lesson_id`, `sequence`, `text` | unique `(lesson_id, sequence)` |
| `learning_resources` | `lesson_id`, `sequence`, `title`, `type`, `external_url`, `asset_reference` | unique `(lesson_id, sequence)`; type check |

Additive only: no account, session, token, MFA, rate-limit or audit table is altered. Status is
stored as a bounded string with a CHECK constraint instead of a native PostgreSQL enum, so the
same DDL applies to SQLite tests and PostgreSQL and the downgrade needs no type drops.
Child rows cascade with their parent; nothing cascades from account tables.

## 4. CEH v12 content boundaries

- `planned_module_count = 20` on the CEH v12 **course instance**; the `Course` model has no
  hard-coded 20 and supports any number of future courses.
- `python -m app.seed_catalog` creates the `CEH-V12` draft course plus a single draft Module 01
  shell titled *Introduction to Ethical Hacking* (the only confirmed title). It is idempotent:
  re-running reports "already present" and creates nothing.
- **No lessons, objectives, resources or body text are seeded.** The 19 unavailable modules are
  not created in any form, so nothing can be mistaken for authored curriculum.
- Sequence 1–20 remains addressable, so modules can be added progressively as source material
  arrives; API rejects `sequence > planned_module_count` (`422`).
- No training PDFs, excerpts or proprietary text are committed.

## 5. Security controls

| Control | Implementation |
|---|---|
| Authentication | `get_auth_context` — session cookie, revocation, expiry, account active |
| Session-scoped role | Reads use the **active** session role; an assigned-but-inactive Manager role grants nothing |
| Administrator MFA | unchanged `get_auth_context` enforcement (pre-existing) |
| Recent step-up | `authorize(..., sensitive=True)` on all 9 mutations: `authenticated_at` < 5 min, plus `mfa_verified_at` < 5 min for Administrators |
| Manager boundary | Managers manage global curriculum (per architecture); they still cannot touch Manager/Administrator *accounts* — unchanged `routes_admin` rules |
| Origin / CSRF | `require_origin` on every mutation; frontend proxy behaviour untouched |
| Draft leakage | Non-privileged reads filter on published status at lesson, module **and** course level; unpublished ancestors return the same `404` as a missing record |
| Lesson bodies | `GET /lessons/{id}` → `403` for student and instructor until 02B enrollment exists |
| Input validation | Pydantic `extra="forbid"`, `minProperties: 1` on patches, bounded lengths/counts, `^[A-Z0-9-]+$` course code, http(s)-only resource URLs, relative-only `asset_reference` (no absolute or `..` paths) |
| Uniqueness | DB unique constraints on `code`, `(course_id, sequence)`, `(module_id, sequence)`, `(lesson_id, sequence)`, `(course_id, sequence)` for resources/objectives; races surface as `409` |
| Audit | `catalog.course_created/updated/published`, `catalog.module_created/updated/published`, `catalog.lesson_created/updated/published` with actor, object id and changed-field names |
| No client-owned state | No timestamp, actor, status or version accepted from the client |
| Trusted proxy | untouched |

## 6. Test results (focused development checks)

Commands run from `backend/` with `.venv`:

| Command | Result |
|---|---|
| `pytest -q tests/test_milestone_02a_catalog.py` | **11 passed** |
| `pytest -q tests/test_postgres_catalog.py` (with `CYBERLAB_TEST_POSTGRES_URL`) | **3 passed** |
| `pytest -q` (SQLite) | **82 passed, 8 skipped** |
| `pytest -q` (PostgreSQL 17) | **90 passed** |
| `alembic upgrade head` / `downgrade 0002_account_security` / `upgrade head` (SQLite) | clean round trip |
| `pytest` migration round trip on PostgreSQL (test 1 above) | clean, account tables untouched |

Coverage of the requested areas:

- course creation, validation (code pattern, unknown fields, `planned_module_count` bounds) and
  duplicate-code `409`
- module sequence uniqueness (`409`) and `planned_module_count` bound (`422`, and `409` when a
  plan is shrunk below an existing sequence)
- lesson creation with objectives/resources, `content_version` bump on edit, unsafe resource
  rejects (`422`)
- draft visibility: empty catalog, `404` for draft course/module, draft lesson hidden inside a
  published module, no `body_markdown` in any list
- publishing permissions and ordering: empty-body `409`, module-without-lessons `409`,
  double-publish `409`, course-before-module ordering
- unauthorized access: anonymous `401`, student/instructor `403`, bad `Origin` `403`, stale
  step-up `403` (reads still allowed)
- migration upgrade/downgrade on SQLite **and** PostgreSQL
- OpenAPI parity: committed `shared-contracts/openapi.json` == `app.openapi()`
- seed idempotency (twice) and "no invented content" assertions
- pagination bounds (`limit` > 100 → `422`, negative offset → `422`) and totals
- PostgreSQL concurrency: two simultaneous module creations at the same sequence → `201` + `409`,
  exactly one row persisted

### Live verification (real Uvicorn + PostgreSQL 17)

Temporary database `cyberlab_02a_live_*`, `python -m app.run` on `127.0.0.1:8010`, deleted after
the run. Results:

- `/openapi.json` served by the running app is **identical** to the committed contract (42 paths, 0.3.0)
- admin bootstrap → login → Administrator blocked before MFA → MFA enroll/confirm → activate role
- `POST /admin/courses` → `201 draft`, `planned_module_count` 20; module 21 rejected `422`
- lesson created (v1) → publish course/lesson/module in order → all `200`
- student: catalog shows `1` published module, module list `[1]`, lesson metadata without body,
  `GET /lessons/{id}` → `403`, `/admin/courses` → `403`, responses `no-store`
- `python -m app.seed_catalog` twice → "already present", no duplicate records
- audit trail contained all six `catalog.*` actions from the walkthrough

## 7. Contract

- `shared-contracts/openapi.json` regenerated via `python scripts/export_openapi.py`; info version
  `0.3.0`, 42 paths (27 pre-existing + 15 new), 16 new schemas.
- Verified additive: **0 changed** pre-existing paths, **0 changed** pre-existing schemas, no
  removed paths. The frontend can adopt the new endpoints without touching existing calls.

### Contract deviations from the proposal (all deliberate, documented)

1. **Identifiers are plain strings**, not `format: uuid`, matching every existing 01x schema. UUID
   values are still generated and stored; only the OpenAPI annotation differs.
2. **`GET /lessons/{id}` returns `403` for students and instructors** in 02A. The proposal said
   "privileged until 02B"; enrollment-based learner access and cohort instructor access need the
   02B tables, so the body stays content-manager–only.
3. **`GET /admin/courses` requires the Manager/Administrator role but not fresh step-up.** Step-up
   guards the 9 mutations; a read-only draft listing stays available to a stale session, matching
   the existing `/admin/users` behaviour verified in 01D.
4. **`planned_module_count` is `NOT NULL` with `> 0`.** The architecture allowed it to be nullable;
   the API requires it on create and never clears it, so nullable would have been unreachable.
5. **Resources have no independent `status`.** They inherit the lesson lifecycle; a resource-level
   state the API cannot set or expose would be unused.
6. **No `content_source_refs` table.** No source metadata is genuinely available without pointing
   at proprietary material; creating the table now would invite exactly that.
7. **Module publish requires ≥1 published lesson** (architecture: "no orphaned module"), while
   lesson publish does **not** require a published module (avoids a publish cycle). Course publish
   has no module requirement, so a published course may show fewer modules than planned.
8. **Error bodies use FastAPI's `detail` shape** (`HTTPValidationError` for `422`) rather than the
   proposal's generic `Error`, consistent with 01x.
9. **No `x-authorization` extensions**; the same information is carried by OpenAPI tag metadata
   plus this report, which keeps the generated contract human-authored-free.
10. **`sequence` above the plan → `422`**, while shrinking the plan below an existing sequence →
    `409` (invalid input vs. conflicting state).

## 8. Unknown-field policy

Every catalog input model sets `extra="forbid"`, so a client that sends `status`, `published_at`,
`content_version`, an actor id or any typo receives `422` instead of a silently ignored field.
Patch models additionally require at least one field.

## 9. Remaining limitations

1. **Lesson bodies are unreachable for learners until 02B.** Students see catalog metadata and
   lesson titles only; that is intentional, not a defect.
2. **No archive/delete endpoints.** The proposal allowed archive "only if useful in 02A"; it is
   deferred, so records cannot be removed through the API at all (only status changes via publish).
3. **No resource/objective PATCH verbs.** Objectives and resources are replaced wholesale with the
   lesson patch, which keeps ordering deterministic and avoids per-row endpoints.
4. **`planned_module_count` may exceed the modules that exist.** By design for CEH v12 (20 planned,
   1 available); the UI must present the difference honestly.
5. **Archived status is storable but not reachable** through the API yet; queried catalog reads
   exclude it via the published filter.
6. **No rate limiting on catalog mutations.** They are privileged, step-up gated and audited;
   adding per-actor throttles is a later hardening item.
7. **Search/sorting are minimal** (courses by `code`, modules/lessons by `sequence`). Server-driven
   sorting parameters were not requested for 02A.
8. **Frontend, cohorts, enrollment, progress and grading are out of scope** and not implemented.

## 10. Pull request

- Branch: `deepseek/milestone-02a-catalog` → `main`. Not merged.
- PR link and commit SHA are recorded in the PR itself; this file is committed before the PR head
  is final.
