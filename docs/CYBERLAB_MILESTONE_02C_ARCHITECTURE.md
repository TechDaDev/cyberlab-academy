# CyberLab Academy — Milestone 02C: Learning Progress Architecture

**Status:** Implementation handoff for DeepSeek; proposed operations are not yet implemented.  
**Prepared:** 2026-10-29.  
**Baseline:** TechDaDev/cyberlab-academy main at 9afc37fc986e1b530f26c53efa35ecd05c80958c.  
**Ownership:** ChatGPT architecture and acceptance; DeepSeek backend/API; Arena AI frontend/UX; Codex independent focused QA.

## 1. Objective and strict boundary

Build server-authoritative lesson-completion records and derived per-enrollment/per-module/per-course progress, with instructor views scoped to assigned classes and Manager/Administrator aggregate progress views. This is academic lesson progress, **not** cybersecurity mission completion, performance grading, examination scoring, certification or attendance.

02A has courses, modules, lessons, published/draft lifecycle and lesson content_version. 02B has course cohorts, assigned instructors, student enrollments, student/instructor publication-gated lesson access, and session-active role authorization. Preserve both. No fictional lesson completions or demo progress may be seeded. Never mix existing demo indicators with live percentages.

**CEH v12 constraint:** The CEH-V12 course has 20 planned modules; only Module 01's source was originally supplied, and Module 02 PDF has since been provided to ChatGPT separately. Ingesting/authoring Module 02 is an independently approved content task, not part of 02C. No new proprietary text, missions, or fabricated curriculum content enters the repository through this milestone.

## 2. Existing baseline and non-regression rules

- FastAPI, SQLAlchemy, Alembic head 0004_cohorts_enrollment, PostgreSQL primary; SQLite local tests; API v0.4.0 and shared-contracts/openapi.json with 56 paths.
- User, UserRole, Session with session.active_role; existing secure session cookies, trusted proxy/origin, CSRF, admin MFA, 5-minute privileged step-up, audit events.
- Course.status, CourseModule.status, ModuleLesson.status must all be published to count a lesson in current progress or allow completion. ModuleLesson.content_version increments on PATCH even when already published.
- CohortEnrollment.status is active or withdrawn. CourseCohort.status is draft, active, completed or archived. A completed/archived class never grants permission to create completion evidence.
- 02B student lesson-body grants require current Student active role, verified email, active enrollment in an active cohort of that exact course. Instructor live assignment is checked on each request. Managers/admins have broader administrative reads but **cannot complete on behalf of a student**.
- No existing 02A/02B API route, body, or schema changes other than intentionally additive 02C routes; no frontend edits in backend PR. Do not create credentials, external service calls or arbitrary file storage.

## 3. Persistence: immutable version-specific completion evidence

**Preferred table: lesson_completion_events**, with exactly one event per (enrollment_id, lesson_id, lesson_version). This is an intentional refinement of the original proposed mutable lesson_progress row: evidence must remain immutable across re-completions after content edits.

Fields:
- id — UUID String(36) primary key;
- enrollment_id — FK cohort_enrollments.id NOT NULL, indexed; **no cascade delete** from completion evidence;
- lesson_id — FK module_lessons.id NOT NULL, indexed; no cascade delete;
- lesson_version — positive integer, server copied from ModuleLesson.content_version at completion;
- completed_at — UTC DateTime(timezone=True), server-generated once;
- created_at optional if already distinct and justified (avoid needless duplicate timestamps).

Constraints:
- UNIQUE (enrollment_id, lesson_id, lesson_version).
- CHECK (lesson_version >= 1).
- FK referential integrity on PostgreSQL and SQLite; no deletion of historical progress.
- No client-supplied enrollment owner, user_id, lesson_version, completed_at, score, earned points or timestamps.
- Do not implement un-complete/delete/overwrite in 02C. A repeated successful request for the **same current version** returns the same existing evidence and timestamp; no additional audit event.
- A later lesson edit that increments content_version permits a **new version-specific completion event**, while older evidence remains readable historically. Use UTC-aware timestamps and deterministic ordering.

**Concurrency:** Under two simultaneous identical completion requests, exactly one evidence row exists. Treat a UNIQUE conflict as an idempotent success by safely rolling back and re-reading the existing row, not as 500 or duplicate rows. PostgreSQL concurrency test is mandatory; SQLite local tests should also run. Consider a safe per-request transaction and avoid swallowing unrelated IntegrityErrors.

**Legacy cohort deletion caution:** 02B has course_cohorts -> cohort_enrollments cascades in the DB/ORM. No hard-delete API currently exists. Ensure new evidence FKs prevent accidental loss in future schema changes, and document future class-deletion behavior explicitly. A downgrade of 0005 must remove new evidence table before returning to 0004.

**Migration:** additive Alembic 0005_lesson_progress (or equivalently named, documented) with valid upgrade/downgrade on existing data.

## 4. Progress semantics and revision model

Denominator = **currently published lessons** whose module and course are also published AND whose module belongs to the enrollment's course. This is an academic content denominator, not "planned modules" or a count of unavailable CEH modules.

For a particular enrollment and currently published lesson:
- current = an immutable event exists with lesson_version == current ModuleLesson.content_version.
- needs_review = at least one older version event exists, but none for current version.
- not_started = no completion event exists for that lesson.
- An old completion cannot count as current after a version bump. Preserve the prior evidence, do not silently rewrite timestamps.
- If a lesson is unpublished/archived, it is excluded from current progress denominators and ordinary learner lesson listings; historical evidence remains stored but is not advertised as current credit.
- If a new published lesson appears, the denominator grows and percentages can decrease. Do not store percentages as authoritative DB columns.
- Module progress is derived from published lessons in that module; course progress rolls up across published modules and their published lessons, without double counting across cohorts.
- One enrollment is its own progress scope. A student enrolled in **two distinct classes of the same course** has separate completion records for each enrollment. Do not automatically award completion in the second class.
- For zero eligible published lessons: percentage = 0, is_complete = false, completed = 0; never claim 100% completion of an empty course.
- percentage = completed_current / eligible_published_lessons * 100, rounded consistently (one decimal recommended); always expose integer numerator and denominator. For nonzero denominator, is_complete true only when completed_current == total.
- "needs_review" is reported separately from current completed; counts and lesson-level statuses must reconcile.
- Completion is a self-attested "I completed reading/reviewing this lesson", not proof of mastery or verified mission work. Label accordingly in API docs and future UI.
- Content editing behavior is important: 02A PATCH on a published lesson increments content_version without necessarily unpublishing it. Thus progress becomes needs_review immediately on the next request; no manual synchronization job.

## 5. Authorized reads and writes

**Student, active Student session role only:**
- GET own enrollment progress. May view historical own progress for withdrawn/completed classes, provided account and role remain valid, but cannot read restricted lesson body if access was revoked. Do not return archived/unpublished lesson bodies, private content, or classmate data in a progress response.
- PUT completion: require active, verified Student account; matching enrollment.id owned by session.user.id; enrollment.status active; cohort.status active; lesson in exact enrolled course with all three content statuses published; no trust in a request-provided class/owner/course ID. Apply Origin/CSRF, but **do not** demand Manager/Administrator step-up for a normal Student learning action.
- A Student must not complete a lesson through another student's enrollment, a different course's lesson, a withdrawn enrollment, a completed/archived class, unpublished content, or an unverified account.
- Unauthorized other enrollment IDs should return 404 to conceal existence. Invalid published/relationship state can be 403 or 409 as documented, never include lesson body.

**Instructor, active Instructor role only:**
- GET class progress only when currently assigned to that exact cohort (removed_at null) AND account active with Instructor role. Instructor may view academic progress for a completed class while a live assignment remains, for teaching follow-up; completion writing is still disallowed to students once class is no longer active.
- Class progress endpoint includes per-student minimal roster progress and class aggregate (current count, mean percentage, class coverage). Scope by cohort_id, not course_id alone: being assigned to class A must never expose class B.
- Optional per-enrollment detail read for assigned class if the UI needs individual module breakdowns; if implemented, verify cohort_id + enrollment_id association with 404 concealment.
- Instructors cannot create/modify/delete completion evidence.

**Manager/Administrator, active Manager/Admin role only:**
- GET aggregate progress for any class via a dedicated admin class progress route, matching the scoped instructor DTO. No recent step-up needed for **read-only** administrative progress; existing administrator MFA/session rules still apply.
- No manager "mark student complete", no grade override, no edit of events, no bulk progress mutation. Managers can manage existing class memberships via 02B only.

**Non-owner / cross-cohort:** never reveal another student's progress or a student's private record via guessed IDs. The fact that a user also has a secondary role is irrelevant unless activated. Existing authentication/role switching remains server-enforced.

**Privacy:** Progress and roster responses contain no lesson Markdown bodies, tokens, scores, passwords, verification links, raw audit internals or other student records outside explicitly authorized cohort; limit identity fields to id + full_name in authorized instructor/admin aggregate. Cache-Control no-store, Referrer-Policy no-referrer. Avoid leaking full progress payloads into telemetry.

## 6. Proposed API (base /api/v1) — authoritative OpenAPI generated after implementation

| Method | Path | Active role | Purpose |
|---|---|---|---|
| GET | /me/enrollments/{enrollment_id}/progress | Student owner | Current course/module/lesson progress + historical version flags |
| PUT | /me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion | Student owner, eligible active enrollment | Idempotent complete-only action; create/read immutable current-version event |
| GET | /instructor/cohorts/{cohort_id}/progress?limit=&offset= | Live-assigned Instructor | Scoped class aggregate plus paginated student progress rows |
| GET | /admin/cohorts/{cohort_id}/progress?limit=&offset= | Manager/Administrator | Same aggregate and roster, role-authorized |

If a separate instructor/student progress detail endpoint is needed, propose it in the implementation report before adding; avoid expanding scope unnecessarily. Do **not** add fake endpoints for scores, certificates, mission attempts, or time-on-task.

### Payload sketches (proposals, not implemented APIs)

PUT request must be exactly:
~~~json
{"completed": true}
~~~
Reject false, arbitrary keys, user_id, score, lesson_version, timestamps, grade or client-supplied completion percentage (422). Use Pydantic extra="forbid".

On first successful PUT, return 200 or 201 with a stable version-specific completion response. A repeat PUT for that version yields 200 and **the original completed_at**. Response model should clearly state enrollment_id, lesson_id, lesson_version, completed_at, and whether the action was newly recorded (optional), without grading information.

GET /me/enrollments/{id}/progress should return, at minimum:
- enrollment_id, course_id, cohort_id, cohort_status, enrollment_status;
- total_published_lessons; completed_current_lessons; needs_review_lessons; percent_complete; is_complete;
- modules in sequence: module_id, title/sequence (published metadata only), published_lesson_count, current_completion_count, needs_review_count, percent_complete;
- lesson statuses per published module: lesson_id, lesson title/sequence (published metadata only), current lesson_version, status (not_started/current/needs_review), completed_at for current completion, last_completed_version if historical. May omit historical timestamps if privacy or query cost dictates but do not lose server evidence.

GET instructor/admin class progress should return:
- cohort_id, course_id, cohort_status, total_active_enrollments, total_visible_enrollments used in calculations, **denominator semantics**;
- aggregate average percent across active enrollment rows (clearly label averages, not grades);
- paginated student rows: enrollment_id, student_user_id, student_full_name, enrollment_status, completed_current_lessons, total_published_lessons, needs_review_lessons, percent_complete;
- pagination limit 1–100/offset >= 0; aggregation must not be computed only over the current page while calling it a whole-class average.

Define active-enrollment metric rules explicitly. Recommended: class averages use active enrollment rows; withdrawn students are excluded from active class mean but their own history remains accessible. In completed classes, enrollment rows may remain "active" in DB; report these as historical class summaries, not live learning access.

All APIs remain cookie-authenticated and use existing same-origin /api/v1 proxy. No GET has side effects. Completion PUT must validate Origin and perform server-authoritative time/version stamping.

## 7. Performance and consistency

- Prevent N+1 on class aggregates (bulk/grouped queries or bounded sets), and paginate student rows. For a small demo class a simple approach works, but verify query growth does not explode with many enrollments.
- Bind lesson version and event insert consistently (under concurrent content editing). PostgreSQL row lock or equivalent transaction strategy if necessary. Never issue evidence for an unvalidated or stale/unpublished version.
- Use existing patterns: get_auth_context, authorize, require_origin, security response headers, audit helper(s), Pydantic validation, Alembic, deterministic ordering and FastAPI response models.
- Use server-derived UTC time, not wall clock from browser.
- Concurrency idempotence applies to the same enrollment+lesson+version; do not swallow unrelated DB conflicts. Repeat PUT should be safe on ordinary page refresh/double click/retry.
- Read progress as of request time. It must reflect withdrawals, role changes, publication and version edits without a background job or stale persisted aggregate.
- Content version changes on an existing published lesson should make an older completion needs_review until re-completion of the new version.

## 8. Test matrix and acceptance

**Focused backend tests:**
1. migration upgrade/downgrade/upgrade PostgreSQL + SQLite, preserve 02A/02B data;
2. first PUT records server time and version; second PUT is idempotent with original timestamp;
3. 2 concurrent PostgreSQL PUTs yield one evidence row without 500 or duplicate audit;
4. Student ownership/active role/verified status, 401/403/404 and Origin enforcement;
5. same course but **wrong enrollment_id** (especially two classes in same course) cannot reuse completion;
6. cross-course lesson, draft lesson, module/course unpublished, withdrawn class, completed/archived class rejected;
7. instructor class A cannot read class B progress; removed assignment loses access on next request; assigned-but-inactive role cannot read;
8. Manager/Admin aggregate access, Student/Instructor blocked from admin route; no recent step-up required for GETs;
9. lesson version bump makes current completion stale without loss of evidence; re-completion makes current again, retains original event;
10. new published lessons grow denominators; zero lessons percent 0 and is_complete false; no 20-module denominator conflation;
11. withdrawn learner's own historical GET remains accessible but PUT denied; per-class active-only aggregate excludes withdrawn;
12. no progress leak to student-facing other-user responses; no lesson body in progress JSON; no hardcoded grades or scores;
13. generated OpenAPI parity, v0.5.0 additive existing 0.4.0 paths/schemas;
14. instructor/admin class aggregate matches actual full population, not just paginated first page;
15. legacy auth/role-switch/lesson-access focused regressions.

**Live integration smoke:** disposable PostgreSQL, FastAPI on temporary port, synthetic published course + 2 published lessons in 1 module, active class + instructor + Student. Confirm Student reads lesson then PUT completes one; GET shows 1/2 and correct percent; Instructor reads 1/2; update published lesson version -> current count returns 0/2 with needs_review=1; retry PUT -> 1/2; withdrawal -> PUT denied while own historical GET remains; removing instructor -> scoped progress GET denied; Manager aggregate still visible. Clean up only temporary resources. No real student data.

**Frontend integration acceptance (later Arena PR):** Student My Classes/lesson viewer shows true server completion state and a "Mark lesson complete" control only when eligible; refresh persists; revised lessons display "Needs review"; instructor class progress table and manager class aggregate are API-backed, accessible and correct; no client-calculated authoritative percentages; no cached progress after role switch/revocation; no cross-class user data. Demo-only cards stay labeled DEMO.

## 9. Deliverables and workflow

**DeepSeek backend:**
- Work on existing branch deepseek/milestone-02c-progress from accepted main. Read this architecture completely before code.
- Add SQLAlchemy models, Alembic 0005, typed schemas and new routes/service helpers; adapt app.main tags/header rules if needed.
- Update shared-contracts/openapi.json using existing exporter; target API version 0.5.0.
- Add focused tests, docs/ARENA_02C_FRONTEND_API_GUIDE.md and docs/MILESTONE_02C_BACKEND_REPORT.md; distinguish implementation decisions/deviations.
- PR against main; do not merge; do not alter frontend.

**Arena frontend:** After verified 02C backend contract, branch stacked on DeepSeek's 02C branch. Extend Student learning detail and lesson viewer, Instructor teaching class progress, Manager class progress. Use no demo substitutes for real progress, and mark all assessment scores as unavailable rather than zero. Add contract/role/access/race UI tests. PR stacked, no merge.

**Codex:** After combined implementation, targeted independent QA: real PostgreSQL+browser, completion/dedup, version staleness, revocation, cross-enrollment/class denial, aggregate correctness, minimal tests. No broad reruns of CI-passing suites.

**ChatGPT:** Review PRs, QA acceptance, dependency-order consolidation only after user approval.

## 10. Decisions deferred

- Full class-level content revision snapshots/version pinning.
- Progress restoration on transfers between cohorts.
- Teacher-confirmed or manager-overridden completion.
- Required prerequisites, minimum read time, quizzes, examinations and scoring.
- Mission definitions, mission attempts, simulation runtime, and evidence grading.
- Content ingestion for Module 02 and subsequent CEH source material.

**Design rule:** A student marking a lesson complete acknowledges learning progress; it is not a security competency certification.
