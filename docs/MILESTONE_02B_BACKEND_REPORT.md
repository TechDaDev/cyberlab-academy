# Milestone 02B — Classes, Enrollment and Lesson Authorization Report

- **Date:** 2026-10-28
- **Branch:** `deepseek/milestone-02b-cohorts` (based on `main` @ `7bdb22a`, which contains the
  accepted Milestone 02A plus the 02A frontend)
- **Owner:** DeepSeek (backend engineering)
- **Specification:** `docs/CYBERLAB_MILESTONE_02B_ARCHITECTURE.md`
- **Scope:** Phase 02B only. No lesson completion, progress, grading, certificates, assessments,
  timed missions, self-enrollment, invitations or content import.

Independent integration QA is Codex's responsibility. This report claims local verification only.

---

## 1. Delivered

| Deliverable | Location |
|---|---|
| Models | `backend/app/models.py` — `CourseCohort`, `CohortInstructor`, `CohortEnrollment`, `CohortStatus`, `EnrollmentStatus` |
| Migration | `backend/alembic/versions/0004_cohorts_enrollment.py` |
| Access rules | `backend/app/access.py` (relationship resolution for lesson bodies) |
| Schemas | `backend/app/schemas_cohorts.py` |
| Routes | `backend/app/routes_cohorts.py` (14 paths / 17 operations) |
| Lesson gate | `backend/app/routes_catalog.py` — `GET /lessons/{id}` now delegates to `app.access` |
| Contract | `shared-contracts/openapi.json` — API **0.4.0**, 56 paths |
| Tests | `backend/tests/test_milestone_02b_cohorts.py` (11 tests) plus updated 02A expectations |
| Frontend handoff | `docs/ARENA_02B_FRONTEND_API_GUIDE.md` |

## 2. Database changes (migration `0004_cohorts_enrollment`)

| Table | Columns | Constraints / indexes |
|---|---|---|
| `course_cohorts` | `id`, `course_id` → `courses.id`, `code`, `name`, `status`, `starts_at`, `ends_at`, `created_by`, `created_at`, `updated_at` | unique `(course_id, code)`; `status IN (draft, active, completed, archived)`; `ends_at > starts_at` when both present; indexes on `course_id`, `status` |
| `cohort_instructors` | `id`, `cohort_id` → `course_cohorts.id` (CASCADE), `instructor_user_id` → `users.id`, `assigned_by`, `assigned_at`, `removed_at` | unique `(cohort_id, instructor_user_id)`; indexes on both FKs |
| `cohort_enrollments` | `id`, `cohort_id` (CASCADE), `student_user_id` → `users.id`, `status`, `enrolled_by`, `enrolled_at`, `ended_at`, `updated_at` | unique `(cohort_id, student_user_id)`; `status IN (active, withdrawn)`; indexes on `cohort_id`, `student_user_id`, `status` |

- Additive and reversible: `courses`, `course_modules`, `module_lessons` and every account table
  are untouched, so accepted 02A data stays valid. Round trip verified on SQLite and PostgreSQL.
- Removal is **soft** (`removed_at`, status), so membership history survives for the 02C progress
  model. Only deleting a class cascades to its own membership rows.
- `course_id` is immutable: it is absent from every request schema, and `extra="forbid"` turns an
  attempt into `422`.

## 3. Implemented endpoints

### Administration (active Manager/Administrator; reads role-only, mutations `Origin` + step-up)

| Method | Path |
|---|---|
| GET | `/admin/cohorts` (`course_id`, `status`, `limit`, `offset`) |
| POST | `/admin/cohorts` |
| GET | `/admin/cohorts/{cohort_id}` |
| PATCH | `/admin/cohorts/{cohort_id}` |
| POST | `/admin/cohorts/{cohort_id}/activate` |
| POST | `/admin/cohorts/{cohort_id}/complete` |
| POST | `/admin/cohorts/{cohort_id}/archive` |
| GET | `/admin/cohorts/{cohort_id}/instructors` |
| POST | `/admin/cohorts/{cohort_id}/instructors` |
| DELETE | `/admin/cohorts/{cohort_id}/instructors/{user_id}` |
| GET | `/admin/cohorts/{cohort_id}/enrollments` |
| POST | `/admin/cohorts/{cohort_id}/enrollments` |
| PATCH | `/admin/enrollments/{enrollment_id}` |

### Instructor (active Instructor role + live assignment)

`GET /instructor/cohorts`, `GET /instructor/cohorts/{cohort_id}`,
`GET /instructor/cohorts/{cohort_id}/students`

### Student (active Student role, own records)

`GET /me/enrollments`, `GET /me/enrollments/{enrollment_id}/course`

### Extension of an existing operation

`GET /lessons/{lesson_id}` — same path, same `LessonDetail` schema, new authorization (below).
No other 02A endpoint changed.

## 4. Authorization rules

**Lifecycle:** `draft → active → completed → archived`, plus `draft → archived`. Every other
transition is `409`; there is no delete. Activation requires a published course **and** at least
one eligible instructor (active account holding the Instructor role, assignment not removed).
`course_id` and `status` are not patchable.

**Assignment:** target must exist (`404`), be active and hold the Instructor role (`409`).
Duplicate active assignment is `409`; re-assigning a removed window clears `removed_at` and keeps
the same row, with a fresh audit event. Removal is soft (`204`), and repeating it is `404`.

**Enrollment:** only into an `active` class, for an active, **email-verified** user holding the
Student role (`409` otherwise). Duplicates — including concurrent ones — are `409`.
`PATCH` moves `active ↔ withdrawn`; sending the current status is `409`; reactivation requires the
class to still be active. No self-enrollment exists.

**Lesson body access** (`app.access.can_read_lesson_body`, re-evaluated on every request):

| Active role | Granted when |
|---|---|
| Manager / Administrator | always — the 02A authoring preview, drafts included |
| Student | account active, email verified, active enrollment in an **active** class of this lesson's course, and course + module + lesson all published |
| Instructor | live (not removed) assignment in an **active** class of this lesson's course, lesson/module/course published |
| any other state | `403` |

Consequences, all covered by tests: another course's published lesson is `403`; a draft lesson
inside the enrolled course is `403`; withdrawal, instructor removal, class completion, account
suspension and role revocation revoke access on the next request; an assigned-but-inactive
Instructor role grants nothing.

**Visibility:** unrelated classes answer `404` (existence concealed) on instructor reads; another
student's enrollment id answers `404`. Rosters and enrollment payloads are `no-store` and contain
no other learner's private data.

## 5. Security controls (preserved and extended)

Existing, unchanged: session-cookie auth, `Origin`/CSRF on mutations, 5-minute step-up with
Administrator MFA, optional Manager MFA, last-administrator protection, rate limits, trusted-proxy
resolution, account-scoped audit trail.

Added: `cohort.created/updated/activated/completed/archived`, `cohort.instructor_assigned/removed`,
`cohort.enrollment_created/withdrawn/reactivated` audit events with actor, class id and detail;
`no-store`/`no-referrer` extended to `/api/v1/instructor/` and `/api/v1/me/`; `extra="forbid"` on
every new input (no client `status`, actor, timestamp or `course_id`); database uniqueness plus
`IntegrityError → 409` for concurrent duplicate assignments and enrollments.

## 6. Educational content boundaries

No curriculum was authored or seeded. Module 01 remains the only supplied source; Modules 02–20
stay absent, as does any lesson copy beyond what tests create as clearly synthetic fixtures. The
seed still produces only the draft `CEH-V12` course and a draft Module 01 shell. No fictional
classes, instructors, enrollments or students exist in seed data — every cohort in the tests is
created inside the test. No CEH reference material was copied into the repository.

## 7. Test results

Commands from `backend/` with `.venv`:

| Command | Result |
|---|---|
| `pytest -q tests/test_milestone_02b_cohorts.py` | **10 passed, 1 skipped** (skip = PostgreSQL-only concurrency test) |
| `pytest -q` (SQLite) | **94 passed, 9 skipped** |
| `pytest -q` with `CYBERLAB_TEST_POSTGRES_URL` | **103 passed** |
| `alembic upgrade head` / `downgrade 0003_academic_catalog` / `upgrade head` (SQLite) | clean |
| PostgreSQL migration round trip (via the shared fixture) | clean |

Coverage against the requested list:

| Requirement | Test |
|---|---|
| Cohort lifecycle | `test_cohort_lifecycle_transitions_and_activation_gates` — creation validation, duplicate code, activation gates (unpublished course, no instructor), `complete`/`archive` legality, immutable `course_id`, audit events |
| Instructor eligibility and assignments | `test_instructor_eligibility_and_assignment_history` — missing user, non-instructor, inactive account, duplicate, soft removal, history, reassignment reuse |
| Enrollment eligibility, duplicates, concurrency | `test_enrollment_eligibility_duplicates_and_transitions`, `test_concurrent_enrollment_cannot_duplicate` (PostgreSQL: 2 parallel requests → `201` + `409`, one row) |
| Student lesson access | `test_student_lesson_access_follows_enrollment_state`, `test_student_lesson_access_requires_verified_email` |
| Instructor lesson and roster access | `test_instructor_lesson_and_roster_scope` |
| Cross-course / cross-class denial | same two tests: other course lesson `403`, other class roster/detail `404` |
| Immediate revocation | withdrawal/reactivation, instructor removal, class completion, flipped `email_verified` |
| Active-role enforcement | `test_active_role_decides_each_surface` — dual-role user, anonymous `401`, student-on-admin `403` |
| Privilege guards | `test_cohort_privileges_require_origin_role_and_step_up` |
| Own-record isolation | `test_student_enrollment_reads_expose_only_own_records` |
| OpenAPI consistency | `test_openapi_contract_matches_and_stays_additive` |
| PostgreSQL migration | `test_postgres_catalog_migration_upgrade_and_downgrade` extended path + `0004` in the shared suite |

### Live verification (real Uvicorn + PostgreSQL 17)

Temporary database, `python -m app.run` on `127.0.0.1:8012`, removed afterwards:

- `/openapi.json` served by the running app is **identical** to the committed contract (56 paths, 0.4.0)
- created and published a course/module/lesson; class `draft → active`; instructor assigned; student enrolled
- student lesson `200`, instructor lesson `200`, roster returned only the enrolled learner (`no-store`)
- own enrollments `1`, no email field in the student payload, own course detail resolves
- withdrawal → lesson `403`; reactivation → `200`; instructor removal → `403` and assigned-class list `0`
- class completion → lesson `403` for the enrolled student

## 8. OpenAPI changes

- Version `0.3.0 → 0.4.0`; **14 new paths**, 17 new operations, 17 new schemas.
- **Zero** changes to pre-existing paths or schemas: the lesson-read extension alters behavior, not
  the contract shape.
- New tags: `Cohort management`, `Teaching`, `Enrollment`.
- Regenerate with `python scripts/export_openapi.py`; the parity test fails if the committed file drifts.

## 9. Known limitations

1. **No progress, completion or grading.** Reserved for 02C; nothing in this API implies it.
2. **No self-enrollment, invitations or email delivery.** Only administrators enroll students.
3. **One assignment window per (class, instructor).** Concurrent classes are fine, but history is a
   single row with `removed_at`, not a full event log — the audit table holds the chronology.
4. **Withdrawn enrollments are reactivatable only while the class is active.** After completion an
   administrator must create a new class; that is deliberate.
5. **No class-level content revisions.** A class always reads the course's current published
   lessons; version pinning per class is a later decision point.
6. **Roster exposes email.** Included for teaching contact; it is the only personal field beyond
   name and verification state, and only to a live-assigned instructor.
7. **Deleting a course is impossible through the API**, so classes cannot be orphaned today; a
   future course-archive feature must define what happens to its classes.
8. **`403` vs `404` split is deliberate**: content gates answer `403` (the record is reachable),
   concealed relationships answer `404`. Frontends must not treat them interchangeably.

## 10. Git

- Branch: `deepseek/milestone-02b-cohorts` → PR against `main`, not merged.
- Commit SHA and PR URL: recorded in the pull request; the branch head after the final commit is
  the review target.
