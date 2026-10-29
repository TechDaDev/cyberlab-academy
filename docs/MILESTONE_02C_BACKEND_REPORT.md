# Milestone 02C — Lesson Completion and Progress Backend Report

- **Date:** 2026-10-29
- **Branch:** `deepseek/milestone-02c-progress` (based on `main` @ `9afc37f`, containing accepted 02A
  and 02B plus the 02B frontend)
- **Owner:** DeepSeek (backend engineering)
- **Specification:** `docs/CYBERLAB_MILESTONE_02C_ARCHITECTURE.md`
- **Scope:** Phase 02C only. No quizzes, scores, grades, certificates, mission attempts, timers,
  attendance, prerequisites, transfers or content ingestion.

> **Lesson completion is self-reported academic progress.** A student marking a lesson complete
> states that they reviewed it. It is not an official assessment score, not a competency
> certification, and nothing in this API produces a grade.

Independent integration QA is Codex's responsibility; this report claims local verification only.

---

## 1. Delivered

| Deliverable | Location |
|---|---|
| Model | `backend/app/models.py` — `LessonCompletionEvent` |
| Migration | `backend/alembic/versions/0005_lesson_progress.py` |
| Progress engine | `backend/app/progress.py` |
| Schemas | `backend/app/schemas_progress.py` |
| Routes | `backend/app/routes_progress.py` (4 operations) |
| Contract | `shared-contracts/openapi.json` — API **0.5.0**, 60 paths |
| Tests | `backend/tests/test_milestone_02c_progress.py` (13) + PostgreSQL migration test |
| Frontend handoff | `docs/ARENA_02C_FRONTEND_API_GUIDE.md` |

## 2. Database model and migration

`lesson_completion_events` — immutable, version-specific evidence:

| Column | Type | Notes |
|---|---|---|
| `id` | `String(36)` | UUID primary key |
| `enrollment_id` | `String(36)` FK `cohort_enrollments.id` | indexed; **no cascade** |
| `lesson_id` | `String(36)` FK `module_lessons.id` | indexed; **no cascade** |
| `lesson_version` | `Integer` | server copy of `ModuleLesson.content_version` at completion |
| `completed_at` | `DateTime(timezone=True)` | server-generated once, never rewritten |

- `UNIQUE (enrollment_id, lesson_id, lesson_version)` — one evidence row per enrollment, lesson and
  version.
- `CHECK (lesson_version >= 1)`.
- Foreign keys deliberately omit `ON DELETE CASCADE`, so this evidence cannot disappear if a class
  deletion path is added later. The 02B cascade from `course_cohorts` to `cohort_enrollments` will
  now be blocked by existing evidence — intended, and noted as a future decision.
- Migration `0005_lesson_progress` is additive: no catalog, cohort, enrollment or account table is
  altered; the downgrade drops only this table. Round trips verified on SQLite and PostgreSQL.
- No un-complete, delete or overwrite path exists in 02C.

## 3. API operations

| Method | Path | Active role | Behaviour |
|---|---|---|---|
| PUT | `/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion` | Student owner | `201` new evidence; `200` when that version was already completed (original timestamp) |
| GET | `/me/enrollments/{enrollment_id}/progress` | Student owner | Own progress; withdrawal keeps read access |
| GET | `/instructor/cohorts/{cohort_id}/progress` | Live-assigned Instructor | Class aggregate + paginated student rows |
| GET | `/admin/cohorts/{cohort_id}/progress` | Manager/Administrator | Same payload, no step-up for the read |

Request and response shapes are documented in
[ARENA_02C_FRONTEND_API_GUIDE.md](ARENA_02C_FRONTEND_API_GUIDE.md); the OpenAPI file is
authoritative.

## 4. Progress calculation rules

Denominator = **currently published lessons** where the module and course are also published, for
the enrollment's course. Percentages are never stored.

- `percentage = completed_current / total_published * 100`, one decimal, `0.0` for an empty
  denominator; `is_complete` requires a non-zero denominator and full completion.
- Lesson state: `current` (event exists for the lesson's current `content_version`),
  `needs_review` (only older versions completed), `not_started` (no event).
- Module progress is derived from that module's published lessons; course progress rolls up across
  published modules. One enrollment is one scope — a student in two classes of the same course has
  two independent records.
- Adding a published lesson grows the denominator and can reduce the percentage; unpublishing
  removes a lesson from the denominator while its evidence stays stored.
- Class aggregates are computed over **all** enrollments before pagination: `average_percent_complete`
  is a mean over active enrollments only, `total_visible_enrollments` counts every row (withdrawn
  included, labeled), and `total_active_enrollments` counts active rows. A whole-class average is
  never derived from a single page.
- Progress is recomputed on every request from content + evidence; no background job, no cached
  aggregate.

## 5. Content-version behaviour

- `PATCH /admin/lessons/{id}` bumps `content_version` even when the lesson stays published. The
  next progress read therefore reports `needs_review` immediately — no synchronisation step.
- Re-completing the revised lesson inserts a **new** row for the new version. The earlier row is
  never modified, so historical evidence and its original timestamp remain readable
  (`last_completed_version` in the progress payload).
- The completion handler locks the lesson row (`SELECT … FOR UPDATE` on PostgreSQL; SQLite ignores
  the hint) so a concurrent content edit cannot move the version between validation and insert.
- Duplicate submission for the same version is resolved by the unique constraint: the loser of a
  race rolls back, re-reads the winner's row and returns it as an idempotent `200`.

## 6. Authorization design

| Actor | Completion write | Own progress | Class progress |
|---|---|---|---|
| Student (active role) | own enrollment only, active enrollment + active class + verified email + published course/module/lesson + matching course | own enrollment | — |
| Instructor (active role) | **never** (`403`) | — | assigned classes only, `404` otherwise |
| Manager / Administrator | **never** (`403`) — no fabrication path | — | any class, read-only, no step-up |
| Anonymous | `401` | `401` | `401` |

Additional enforcement:

- `Origin` required on the completion `PUT` (CSRF), with existing session cookie and role rules.
- Another student's enrollment id answers `404`, never `403`, so existence is not confirmed.
- Cross-course completion is `403`; unpublished lesson/module/course is `403`; withdrawn enrollment
  or non-active class is `403`; unverified account is `403`.
- `CompletionRequest` uses `StrictBool` plus `extra="forbid"`: `"yes"`, `1`, `false`, a score, a
  timestamp, a `lesson_version` or another user's id are all `422`. (A lax boolean was caught by a
  test and fixed before delivery.)
- Assignment removal revokes class progress on the next request; account suspension and role
  revocation behave as in 02B (existing `get_auth_context`).
- Audit: exactly one `progress.lesson_completed` event per new evidence row, actor = the student,
  subject = the class. Idempotent repeats add no event.
- Responses are `no-store` / `no-referrer` and contain no lesson bodies, emails of other students,
  scores or internal identifiers beyond the documented ones.

## 7. Test results

Commands from `backend/` with `.venv`:

| Command | Result |
|---|---|
| `pytest -q tests/test_milestone_02c_progress.py` | **13 passed, 1 skipped** (skip = PostgreSQL-only concurrency test) |
| `pytest -q` (SQLite) | **108 passed, 11 skipped** |
| `pytest -q` with `CYBERLAB_TEST_POSTGRES_URL` | **119 passed** |
| Migration up/down/up on SQLite and PostgreSQL | clean; 02A/02B tables preserved |

Coverage against the requested matrix:

| # | Requirement | Test |
|---|---|---|
| 1 | First completion | `test_first_completion_records_server_version_and_time` (server version 1, server time, audit row) |
| 2 | Repeated completion, timestamp stability | `test_repeated_completion_is_idempotent_and_keeps_the_original_timestamp` (also across a fresh session) |
| 3 | Concurrency → exactly one row | `test_concurrent_completion_creates_exactly_one_record` (PostgreSQL, two sessions → `200`+`201`, one row, one audit) |
| 4 | Ownership, active role, verified email, Origin | `test_completion_requires_ownership_role_origin_and_verified_email` |
| 5 | Wrong class / wrong course | `test_completion_rejects_wrong_class_course_and_unpublished_content` (cross-course `403`, second class of same course independent) |
| 6 | Withdrawn / inactive class | `test_withdrawn_enrollment_and_inactive_class_block_completion` (plus historical read still allowed) |
| 7 | Unpublished lesson | same test (draft lesson `403`) |
| 8–9 | Version change, history preserved | `test_content_version_bump_marks_completion_for_review` (v1 and v2 rows both present) |
| 10 | Module/course math | `test_module_and_course_progress_calculation` (2/3 → 66.7, per-module 100%/0% → 100%) |
| 11 | New lesson changes denominator | `test_newly_published_lesson_grows_the_denominator` (100% → 50%) |
| 12 | Zero lessons | `test_published_course_without_lessons_reports_zero_progress` (0/0, `0.0`, `is_complete` false) |
| 13 | Instructor scoping | `test_instructor_class_progress_is_scoped_to_assigned_classes` (other class `404`, removal `404`, no write) |
| 14–15 | Admin aggregate, pagination correctness | `test_admin_class_progress_aggregates_the_whole_class` (whole-class average with `limit=1`, withdrawn excluded from the mean but listed, stale step-up allowed, non-admin blocked) |
| 16 | Contract parity | `test_openapi_contract_matches_and_stays_additive` (0.5.0, committed == `app.openapi()`) |
| 17 | PostgreSQL migration | `test_postgres_progress_migration_round_trip` |
| 18 | 02A/02B regressions | full suites above; student privacy `test_student_cannot_read_another_students_progress` |

### Live smoke (real Uvicorn + PostgreSQL 17)

Temporary database, `python -m app.run` on `127.0.0.1:8013`, removed afterwards. Results:

```
contract parity: True | paths: 60 | version: 0.5.0
student lesson body: 200
complete: 201 v1 new: True
repeat: 200 same timestamp: True
student progress: 1/2 50.0% review=0
instructor class progress: 1/2 | avg: 50.0
revised lesson version: 2 | progress after revision: 0/2 0.0% review=1
re-complete: 201 v2 | progress: 1/2 50.0% review=0
withdrawn PUT: 403 | own history GET: 1/2 50.0% review=0
removed instructor progress GET: 404
admin aggregate still visible: 200 | students: 1
```

## 8. OpenAPI changes

- Version `0.4.0 → 0.5.0`; **4 new paths**, 9 new schemas, new `Progress` tag.
- **Zero** changes to pre-existing paths or schemas — the 02A/02B contract is untouched, so 02B
  frontend code keeps working.
- `PUT …/completion` documents both `201` and `200` responses.
- Regenerate with `python scripts/export_openapi.py`; a parity test fails if the committed file
  drifts from the application.

## 9. Known limitations

1. **Self-reported, not verified.** There is no proctoring, minimum read time, prerequisite or
   teacher confirmation; a student can mark any published lesson of their course complete.
2. **No un-complete or reset.** Evidence is immutable by design; correcting a mistake is a manual
   database operation outside the API.
3. **Class aggregates load the cohort's evidence in memory.** It is one query per class (no N+1), but
   a very large class would benefit from SQL-side aggregation; documented rather than optimised
   prematurely.
4. **Progress is per enrollment.** Transferring a student between classes does not carry completion
   across; that is deferred with the transfer feature.
5. **Class completion keeps enrollment rows active**, so completed classes are reported as
   historical summaries; live learning access is still gated on an active class.
6. **Evidence blocks future class deletion** because the FKs do not cascade. That is deliberate;
   a future delete feature must decide between soft deletion and evidence retention.
7. **No cache layer.** Every progress read recomputes from the database; correct as of request time,
   at the cost of repeated work.
8. **Frontend, missions, scoring and the Module 02 content ingestion are out of scope.** The CEH
   catalog still exposes only Module 01 metadata; no curriculum was invented.

## 10. Git

- Branch: `deepseek/milestone-02c-progress` → PR against `main`, not merged.
- Commit SHA and PR URL are recorded in the pull request; the branch head after the final commit is
  the review target.
