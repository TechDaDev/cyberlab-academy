# CyberLab Academy — Milestone 02B Architecture and Backend Contract

**Status:** Implementation design for DeepSeek; proposed API operations are not yet implemented.  
**Date:** 2026-10-26  
**Baseline:** main @ 7bdb22a03cfce750277c3c9e4e214a3bd0ffff70 (Milestone 02A accepted and merged).  
**Agent ownership:** ChatGPT architecture; DeepSeek backend and generated OpenAPI; Arena AI frontend after contract; Codex independent focused QA.

## 1. Goal and scope

Connect the Milestone 02A academic catalog to classes, eligible instructors, enrolled students, and **server-authorized lesson reading**. Student and instructor lesson bodies currently return 403; Milestone 02B may grant access only through a currently valid teaching or learning relationship. The four pre-existing roles are Student, Instructor, Manager, Administrator; session.active_role remains the authorization source.

Included: cohorts/classes, lifecycle, instructor assignment and removal, student enrollment and withdrawal/reactivation, scoped class roster and own-enrollment reads, lesson access enforcement, audit events, migration, OpenAPI, and backend tests.

Excluded: lesson completion, grades, progress, certificates, assessments, timed missions, simulation engine, self-enrollment, invitations/email delivery, arbitrary upload infrastructure, payment, copyrighted CEH content import, and course edition migration.

**Content rule:** CEH v12 has 20 planned module slots; only Module 01 original source has been supplied as of this design. The seed creates a draft CEH-V12 course plus one draft Module 01 shell with no lessons; it does not publish them. Do not fabricate Modules 02–20 or invent lessons. Module 02 may be uploaded separately for a later content-ingestion stage; do not treat its receipt as authorization to copy training text into Git.

## 2. Existing system invariants to preserve

- Backend FastAPI + SQLAlchemy + Alembic migrations through 0003_academic_catalog; PostgreSQL authoritative; SQLite-backed tests; frontend Next.js same-origin /api/v1 proxy.
- Existing 02A published catalog GETs and administrator draft authoring remain unchanged except explicit, tested extension of GET /api/v1/lessons/{lesson_id} authorization.
- Existing 01D session cookies, CSRF Origin checks, MFA, recent-auth step-up and audit records remain unchanged.
- A Manager/Administrator with the **active** role may preview course/module/lesson drafts for authoring as before.
- A Student/Instructor with the active role must never receive draft lesson bodies or content under draft/unpublished course/module ancestors.
- Generic error messages and status codes must not enumerate private classes, members, or draft content; use 404 for inaccessible IDs where appropriate, 403 for the known role/lesson enrollment gate.

## 3. Database model and lifecycle

Use UUID-as-String(36) PK/FK to match current models and UTC DateTime(timezone=True); DB constraints, indexes and transactional checks; additive migration 0004_cohorts_enrollment (name may differ if documented).

**course_cohorts**
- id; course_id FK courses.id; code string max 40; name string max 160; status string enum draft/active/completed/archived; starts_at nullable; ends_at nullable; created_by FK user ID or UUID reference; created_at, updated_at.
- Unique (course_id, code), nonempty names, bounded code, ends_at > starts_at when both present.
- Course association is immutable after creation. Course may be draft at class creation, but **activating a class requires a published course**. A class may be created without instructors, but activation requires at least one active instructor assignment.
- Class transitions: draft → active → completed → archived. Optionally draft → archived without activation. No arbitrary backward transitions and no hard delete.

**cohort_instructors**
- id; cohort_id FK; instructor_user_id FK users.id; assigned_by; assigned_at; removed_at nullable.
- Unique (cohort_id, instructor_user_id). An assignment is eligible only while removed_at is null AND the user is active and has the Instructor role assigned. Session active role must additionally be Instructor to use teaching endpoints.
- Removing sets removed_at, never deletes; reassigning an inactive row can clear removed_at, with new audit event. Duplicate active assignment is 409.

**cohort_enrollments**
- id; cohort_id FK; student_user_id FK users.id; status enum active/withdrawn; enrolled_by; enrolled_at; ended_at nullable; updated_at.
- Unique (cohort_id, student_user_id); no duplicate active row. Enrollment requires an active class and an active, verified-email user with assigned Student role. No self-enrollment. An enrollment can be withdrawn and later reactivated by an authorized admin mutation with audit trail; revocation of Student role or user deactivation invalidates access immediately.
- No completion status yet: academic progress and completion evidence are reserved for 02C. No client-supplied enrolled_by, actor, timestamps, status on create.

**Persistence controls**
- Prefer explicit service-layer authorization helpers to scattered query conditions. Ensure rollback on integrity errors, map collision to 409, and avoid race-induced duplicate assignments/enrollments.
- Do not hard-delete accounts, content or classes when membership records exist; retain data for progress model 02C.

## 4. Permissions and eligibility matrix

All endpoints require authenticated session. Active role MUST match the operation.

- Student: published catalog metadata; own class/enrollment summary; GET published lesson body **only if** user email verified, user active, student role currently assigned, enrollment ACTIVE, cohort ACTIVE, lesson.module.course_id == cohort.course_id, and course/module/lesson are all PUBLISHED. Never reads classmates' roster or others' enrollment IDs.
- Instructor: list only cohorts where instructor_user_id == authenticated user AND assignment removed_at is null AND Instructor role still assigned; read scoped student roster and PUBLISHED lesson bodies for any ACTIVE assigned cohort of the lesson's course. Never manage global catalog publication. No lesson drafts through instructor role.
- Manager/Administrator: globally manage cohorts/assignments/enrollments; recent step-up and Origin required for every privileged mutation. Read-only administrative endpoints require correct active role but need not require a fresh step-up. Existing administrator MFA and optional manager MFA remain enforced.
- Assigned-but-not-active secondary roles grant no additional access. In particular an assigned Manager role does not let a Student-active session read unpublished content.

**Lesson body access** — extend existing GET /api/v1/lessons/{lesson_id}:
1. Load user and active session role from existing dependency.
2. Content Manager active → existing authoring preview.
3. Student/Instructor active → verify published course + module + lesson ancestors, current enrollment/assignment, class ACTIVE, valid user role/account (Student also verified email). Do not rely on route names, UI state, or a client-provided cohort ID.
4. If no valid relationship, continue returning 403 (or 404 where appropriate to avoid draft ID leakage). No lesson body included in list/search errors, caches, audit detail or unauthorized responses.
5. A single user may belong to multiple classes and multiple roles; only a relationship to **that exact lesson's course** can unlock content.
6. Withdrawing enrollment, removing instructor, completing/archiving class, account deactivation, role revocation, or unpublishing parent content must revoke access on the next request (do not cache a previous grant).

## 5. Proposed REST API (base /api/v1)

All paths here are proposed, not a replacement for generated OpenAPI. Keep the existing 02A endpoints stable; generate shared-contracts/openapi.json from FastAPI, bump API version to 0.4.0, and document deliberate contract deviations.

### Administration — active Manager/Administrator
| Method | Path | Response/purpose |
|---|---|---|
| GET | /api/v1/admin/cohorts | Paged PageCohorts with optional course_id and status filter; no draft leak outside admin |
| POST | /api/v1/admin/cohorts | 201 CohortPublic; create draft with immutable course_id, code, name, optional dates |
| GET | /api/v1/admin/cohorts/{cohort_id} | CohortPublic for any status |
| PATCH | /api/v1/admin/cohorts/{cohort_id} | Edit safe name/dates only; course_id/status immutable via PATCH |
| POST | /api/v1/admin/cohorts/{cohort_id}/activate | Explicit activation after published-course + eligible-assigned-instructor checks |
| POST | /api/v1/admin/cohorts/{cohort_id}/complete | Explicit active → completed |
| POST | /api/v1/admin/cohorts/{cohort_id}/archive | Explicit completed/draft → archived |
| GET | /api/v1/admin/cohorts/{cohort_id}/instructors | List current/history with explicit active state |
| POST | /api/v1/admin/cohorts/{cohort_id}/instructors | Assign/reassign an eligible instructor (request instructor_user_id) |
| DELETE | /api/v1/admin/cohorts/{cohort_id}/instructors/{user_id} | 204; soft remove via removed_at; step-up + Origin required |
| GET | /api/v1/admin/cohorts/{cohort_id}/enrollments | Paged scoped roster/status |
| POST | /api/v1/admin/cohorts/{cohort_id}/enrollments | 201; enroll eligible student_user_id into active class |
| PATCH | /api/v1/admin/enrollments/{enrollment_id} | Change to withdrawn or active by validated transition, with audit |

### Instructor — active Instructor role and live assignment
| Method | Path | Response/purpose |
|---|---|---|
| GET | /api/v1/instructor/cohorts | Paged own assigned cohorts only |
| GET | /api/v1/instructor/cohorts/{cohort_id} | Class detail only if assigned |
| GET | /api/v1/instructor/cohorts/{cohort_id}/students | Paged minimum necessary roster, only assigned cohort |

### Student — active Student role, own membership
| Method | Path | Response/purpose |
|---|---|---|
| GET | /api/v1/me/enrollments | Paged own enrollments; may label withdrawn as inactive but no lesson grant |
| GET | /api/v1/me/enrollments/{enrollment_id}/course | Own class/course summary; access to body only with active eligible enrollment |

### Lesson read
| Method | Path | Change |
|---|---|---|
| GET | /api/v1/lessons/{lesson_id} | Preserve 02A Manager/Admin preview; unlock only published eligible lesson to active enrolled student/assigned instructor |

**DTO notes:** Compact CohortPublic includes id, course_id, code, name, status, starts_at, ends_at, timestamps, active_instructor_count, active_enrollment_count (counts computed, never caller-writable). EnrollmentPublic includes id, cohort_id, course_id, status, enrolled_at, ended_at and limited class/course summary; no confidential student data in student own view. Instructor roster may expose user ID + full name + verified status; include email only if necessary for a documented teaching purpose. Use Page* responses with limit 1–100, offset ≥0. User IDs and role checks always server-derived, except the ID of an account to be assigned/enrolled in a privileged mutation.

## 6. Security and regression acceptance

- Anonymous 401 and inappropriate active roles 403 on all relevant routes.
- Private class IDs/enrollment IDs inaccessible to unrelated roles; no horizontal/vertical IDOR. 404 when resource existence must be concealed.
- Student from course A cannot read a published lesson from course B; cannot access a draft lesson from own course.
- Removing assignment or withdrawal revokes lesson access immediately; status transitions audit actor/object/action.
- Class not ACTIVE cannot grant lesson access; archived/completed classes cannot be used to bypass gating.
- Instructor with assigned-but-inactive role cannot read teaching roster. Assigned instructor in class A cannot list roster of class B.
- User email verification enforced on student enrollment and Student lesson-body reading.
- Manager/Admin mutation Origin + step-up and admin MFA, but administrative GETs need only valid active role.
- Duplicate enrollments/assignments and concurrent creates produce correct 409 rather than silent duplicate rows.
- A class's immutable course association prevents enrollment being reassigned to a different course.
- Contract generated == app.openapi(), old API operations/schemas preserved except documented intentional update to lesson-read behavior.
- New class/enrollment/lesson responses, especially rosters and personal data, Cache-Control: no-store and Referrer-Policy: no-referrer.
- Preserve Milestone 01D authentication/proxy security; do not alter Next.js frontend or existing simulation placeholders.

## 7. Database/testing/operational boundaries

- Additive Alembic 0004 migration with reversible downgrade, FK and uniqueness checks; SQLite smoke and real PostgreSQL round trip; protect existing users/sessions/course tables.
- Seed **no fictional cohorts, instructors, students, enrollments or proprietary learning copy**; tests may create clearly synthetic fixtures.
- Focused tests for status lifecycle, eligibility, resource-scoped reads, cross-course and cross-class IDOR, role switching, withdrawal/removal, concurrent uniqueness, Origin/re-auth, draft rejection, contract parity.
- Live test may run under isolated temporary PostgreSQL database and alternate port; delete only resources created for the test.
- Generate OpenAPI from running FastAPI; document minimal frontend handoff in docs/ARENA_02B_FRONTEND_API_GUIDE.md, including types, response codes, expected lesson gates and any deliberate deviations.
- Use GitHub CI for broader regression. No frontend code modifications. No PR merges by DeepSeek.

## 8. Delivery and acceptance gates

**DeepSeek:** Implement on deepseek/milestone-02b-cohorts, a branch based on accepted 02A main. Commit this design as part of PR, models/migration/routers/security checks/OpenAPI/focused tests, and docs/MILESTONE_02B_BACKEND_REPORT.md; create a PR against main; stop without merging.

**Arena AI:** Only after backend OpenAPI is committed and reviewed: separate frontend branch stacked on DeepSeek 02B, pages for Manager/Admin classes and rosters, Instructor assigned classes/rosters, Student own enrollments and actual permitted lesson viewer. Keep demo-only mission/progress panels labeled demo.

**Codex:** Independent targeted integration QA after Arena: real PostgreSQL, one class+instructor+enrollment, student can read published lesson only while active enrolled, revocation & cross-course IDOR negative cases, existing MFA/step-up; avoid broad re-tests with passing CI.

**ChatGPT:** Coordinate implementation, review, acceptance and dependency-ordered merge once user authorizes.

Design decisions requiring explicit future approval: open self-enrollment/invitations, class-specific content revisions, gradebooks, mission assessment, progress, copyright/source import.
