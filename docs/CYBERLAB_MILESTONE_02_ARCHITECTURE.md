# CyberLab Academy — Milestone 02: Academic Structure and Learning Management

**Status:** Proposed implementation contract (not yet implemented or approved as an API)  
**Prepared:** 2026-10-25  
**Baseline:** GitHub `TechDaDev/cyberlab-academy`, `main` after PRs #1–#7, commit `a198e5c2cb495d4a106b0803b019e166db9b88be`  
**Primary ownership:** DeepSeek — backend / OpenAPI; Arena AI — frontend / UX; Codex — focused independent QA; ChatGPT — architecture and acceptance.

## 1. Purpose and non-negotiable content boundaries

Build the academic layer around **all 20 CEH v12 modules** while recognizing that **only Module 01's source materials have been supplied**. There are **19 remaining source modules**. Do not synthesize their lesson content, titles, quizzes, mission narratives, or assessment items. Do not hard-code 20 into a globally reusable `Course` model; give the CEH v12 *course instance* a `planned_module_count=20` and accept module sequence 1–20 for that course. A course may have only Module 01 recorded initially; module metadata/publishing is distinct from possession of a source document.

Module 01 is currently referred to as **Introduction to Ethical Hacking**. Earlier project planning describes an original *CyberCore Technologies* scenario with six planned missions: **Security Incident; Follow the Attack; Identify the Threat; Authorized to Hack; Defend CyberCore; Compliance Challenge**. This is a planning outline, **not six verified, publishable mission records or an authorization to reproduce training materials**. Mission 01 was identified as the initial future mission implementation. Confirm content with the user-supplied Module 01 source before seeding lesson text. Never commit proprietary CEH PDFs or verbatim training excerpts to Git. Keep source-file metadata/provenance separately from authored educational copy; honor rights and privacy.

The platform remains **mission-based**; lesson-based learning is the academic framework, not a replacement for the mission/simulation vision. The academic layer must remain expandable to other cybersecurity courses and future updated editions of CEH.

## 2. Existing implementation to preserve

- FastAPI / SQLAlchemy / Alembic (migrations through `0002_account_security`), PostgreSQL in production and SQLite-supported local tests.
- Accounts, `User`, `UserRole`, `Session` with **session-scoped active role**, cookie authentication, origin/CSRF protections, verified email, privileged role step-up, administrator MFA, and audit events.
- Four roles: `student`, `instructor`, `manager`, `administrator`.
- Next.js 16/React 19 frontend with same-origin `/api/v1/` proxy and demo-only academic cards.
- `shared-contracts/openapi.json` is generated from the backend and is authoritative after implementation. Current API is v0.2.0, 27 paths. **No academic APIs are implemented yet.**
- `simulation-engine/` is a stub. No execution, grading, timers or practical assessment APIs may be advertised as functional in Milestone 02.

**Repository governance correction:** `AGENTS.md` and the root `README.md` historically say Codex owns backend. The *current, user-approved team workflow* is **DeepSeek backend, Arena frontend, Codex independent QA, ChatGPT architect**. Update documentation through a separate small housekeeping change or the first Milestone 02 PR; do not assign implementation to Codex.

## 3. Phases and delivery boundaries

| Phase | Result | Agent | Blocking dependency |
|---|---|---|---|
| 02A | Course catalog, modules, lessons, objectives, resource references, draft/publish lifecycle, read APIs, versioned contract | DeepSeek | `main` baseline |
| 02A-UI | Courses/modules/lesson screens, manager content authoring and clear unavailable-content states; mobile/accessibility | Arena | Committed generated OpenAPI for 02A |
| 02B | Cohorts (classes), instructor assignments, student enrollments and scoped roster APIs | DeepSeek | 02A contract |
| 02B-UI | Student enrollment view, manager cohorts and instructor teaching screens | Arena | 02B contract |
| 02C | Per-enrollment lesson completion, academic progress roll-ups and immutable completion evidence | DeepSeek | 02B enrollment model |
| 02C-UI | Student progress, instructor cohort progress and manager aggregate views | Arena | 02C contract |
| 02D | Integration hardening, data invariants, focused security/regression verification | Codex | Combined implementation |

**Out of scope until later milestones:** executable mission/simulation runtime, Kali infrastructure, scoring/grading, proctored/timed official assessments, AI feedback, uploaded-file parsing pipeline, arbitrary file hosting, payment, certificates, and educational content for unavailable modules.

## 4. Proposed data model (v0.3 design, names subject to migration/code review)

Identifiers: `String(36)` UUID (align existing tables), `DateTime(timezone=True)` UTC, PostgreSQL uniqueness with SQLite tests where compatible. Store authoritative timestamps and actor identity on the server.

### Core content — Phase 02A

| Table | Important fields | Invariants / indexes |
|---|---|---|
| `courses` | `id`, `code`, `title`, `summary`, `edition`, `planned_module_count` (nullable), `status`, `content_version`, `created_by`, `created_at`, `updated_at`, `published_at` | Unique immutable `code` (e.g. `CEH-V12`); `status: draft/published/archived`; `planned_module_count>0` when present; no hard-coded CEH semantics |
| `course_modules` | `id`, `course_id`, `sequence`, `title`, `summary`, `status`, `created_at`, `updated_at`, `published_at` | Unique `(course_id, sequence)`; `sequence>=1`; for CEH v12, `sequence<=course.planned_module_count` if configured; publishing requires appropriate content |
| `module_lessons` | `id`, `module_id`, `sequence`, `title`, `body_markdown`, `status`, `content_version`, `created_at`, `updated_at`, `published_at` | Unique `(module_id, sequence)`; content version increments on substantive edit; prevent deletion of referenced published lessons |
| `lesson_objectives` | `id`, `lesson_id`, `sequence`, `text` | Unique `(lesson_id, sequence)`; small bounded plain text |
| `learning_resources` | `id`, `lesson_id`, `sequence`, `type`, `title`, `external_url` / `asset_reference`, `status` | Explicit safe types (`external_link`, `reference`, `download_reference`); validated schemes, do not let client supply arbitrary server paths; no actual file-upload/storage in 02A |
| `content_source_refs` (optional for 02A) | `id`, `course_id`, `module_id`, `source_label`, `source_sha256` (optional), `rights_note`, `created_at` | Metadata only; no PDF bytes and no public access to private source reference. Use only if reference metadata is genuinely available. |

**Recommended publication policy:** publishing a course only publishes catalog metadata; learners see module/lesson bodies only when their full hierarchy is published **and** they have access under the academic enrollment rules implemented in 02B. During 02A, do not expose unprotected lesson bodies to unauthenticated clients. A `published` catalog course can have fewer available modules than `planned_module_count`. Never auto-publish Module 01's lesson text without content review.

**Initial seed:** `CEH-V12` course in **draft** with `planned_module_count=20`. Create Module 01 as a draft metadata record only if its confirmed title is available, without inventing lesson content. **Do not create 19 invented titled modules** or seed draft placeholders as learner-visible content. API may expose `planned_module_count=20` and `available_module_count` derived from published module count.

### Teaching relationships — Phase 02B

| Table | Important fields | Invariants |
|---|---|---|
| `course_cohorts` | `id`, `course_id`, `code`, `name`, `status`, `starts_at`, `ends_at`, `created_by`, `created_at` | Unique `(course_id,code)`; `status: draft/open/active/completed/archived`; course ownership fixed once enrollments exist |
| `cohort_instructors` | `id`, `cohort_id`, `user_id`, `assigned_by`, `assigned_at`, `removed_at` | One active assignment per cohort/user; only active, assigned Instructor-role users may teach |
| `cohort_enrollments` | `id`, `cohort_id`, `student_user_id`, `status`, `enrolled_at`, `ended_at`, `enrolled_by` | Unique `(cohort_id,student_user_id)`; `status: active/withdrawn/completed`; active, verified Student required; status transitions audited |

### Learning tracking — Phase 02C

| Table | Important fields | Invariants |
|---|---|---|
| `lesson_progress` | `id`, `enrollment_id`, `lesson_id`, `completed_at`, `lesson_version`, `created_at`, `updated_at` | Unique `(enrollment_id,lesson_id)`; enrolled student owns record; lesson must belong to enrollment's course and remain published; no arbitrary user_id, score, or timestamps in incoming request |

Derive module/course completion progress from **published lessons accessible to that enrollment**, not client-provided percentages. Clearly report denominator and content revision; future course edits can change a derived percentage. Progress is *practice/lesson completion*, not official assessment grading. Keep historic completion records if lessons are later archived; do not cascade-delete academic history. Cross-course/cross-cohort references must be validated transactionally.

### Future extensibility, not built in 02A–02C

Reserve logical relationships for `mission_definitions`, `mission_versions`, `mission_attempts`, server-authoritative timings, event transcripts, scored criteria, and official grading. Do not add deceptive endpoints or real grading tables solely to display metrics in v0.3. A mission belongs to a module (and eventually to a version); its simulation state must be server-validated in later milestones. The previously discussed rubric (40% objective completion, 25% technical accuracy, 15% evidence/analysis, 10% security procedure, 10% completion time) is a **planning proposal**, not a live grading implementation.

## 5. API conventions (binding design rules)

Base path `/api/v1`. Cookie authentication with `credentials: "include"`. Every mutation must honor existing `Origin`/CSRF enforcement. Keep `Cache-Control: no-store` for personalized lessons, rosters and progress; disallow indexing private material. FastAPI authorizes from the **server-side active session role** plus resource relationships (not frontend role flags). Use Pydantic validation, consistent `400/401/403/404/409/422` responses, pagination (`limit` bounded at 100; `offset` initially acceptable), server-driven sorting, and stable generic errors for inaccessible private records when appropriate. Avoid SQL injection and tenant/class enumerations; all edits audited.

**Publication and mutation authorization:** `Manager` or `Administrator` may create/update/publish/archive global course content and manage cohorts; privileged mutations require existing recent-auth/MFA step-up. `Instructor` may read assigned cohort teaching content and scoped rosters, but cannot publish global content. `Student` may browse published catalog metadata, and after enrollment/verification access its assigned published lessons. Users holding multiple roles must activate the relevant role; do not silently authorize by any assigned role.

### Contract 02A — implement first (new endpoints; none exist yet)

| Method | Proposed path | Authentication / scope | Purpose |
|---|---|---|---|
| GET | `/api/v1/courses` | authenticated users | Published catalog summaries; returns `planned_module_count`, `published_module_count` |
| GET | `/api/v1/courses/{course_id}` | authenticated users | Published course detail; no draft leak |
| GET | `/api/v1/courses/{course_id}/modules` | authenticated users | Published module metadata sorted by `sequence` |
| GET | `/api/v1/modules/{module_id}` | authenticated users | Published module metadata or authorized draft preview |
| GET | `/api/v1/modules/{module_id}/lessons` | authorized member or privileged | Lesson **metadata only**; full bodies withheld until 02B enrollment is available; privileged draft preview allowed |
| GET | `/api/v1/lessons/{lesson_id}` | privileged until 02B, then active enrolled learner/assigned instructor | Lesson body/objectives/resources, guarded against draft/unpublished ancestors |
| GET | `/api/v1/admin/courses` | Manager/Admin active role | Draft/published/archived list |
| POST | `/api/v1/admin/courses` | Manager/Admin + recent step-up | Create draft course |
| PATCH | `/api/v1/admin/courses/{course_id}` | Manager/Admin + recent step-up | Update course metadata |
| POST | `/api/v1/admin/courses/{course_id}/publish` | Manager/Admin + recent step-up | Publish course catalog metadata |
| POST | `/api/v1/admin/courses/{course_id}/modules` | Manager/Admin + recent step-up | Create draft module at position |
| PATCH | `/api/v1/admin/modules/{module_id}` | Manager/Admin + recent step-up | Update module |
| POST | `/api/v1/admin/modules/{module_id}/publish` | Manager/Admin + recent step-up | Publish module when valid |
| POST | `/api/v1/admin/modules/{module_id}/lessons` | Manager/Admin + recent step-up | Create draft lesson |
| PATCH | `/api/v1/admin/lessons/{lesson_id}` | Manager/Admin + recent step-up | Update lesson and bump content version |
| POST | `/api/v1/admin/lessons/{lesson_id}/publish` | Manager/Admin + recent step-up | Publish lesson when valid |

**Design constraint:** simplify or group endpoints if needed, but keep consistent naming and clearly annotate any deviation in the committed OpenAPI spec. Publishing must be an explicit action; do not accept arbitrary client-written `published_at`, actor ID, or progress percent. No hard deletion of records referenced by learners; introduce `archive` action only if useful in 02A.

#### 02A request/response DTO sketch (proposed; exact OpenAPI generated from implementation)

```json
{
  "CourseCreate": {"code":"CEH-V12", "title":"Certified Ethical Hacker v12", "edition":"v12", "planned_module_count":20, "summary":"Mission-based ethical hacking curriculum"},
  "CoursePublic": {"id":"<uuid>", "code":"CEH-V12", "title":"Certified Ethical Hacker v12", "edition":"v12", "status":"published", "planned_module_count":20, "published_module_count":1, "content_version":1},
  "ModuleDraftCreate": {"sequence":1, "title":"Introduction to Ethical Hacking", "summary":"<only reviewed original text>"},
  "LessonDraftCreate": {"sequence":1, "title":"<reviewed title>", "body_markdown":"<original authored text>", "objectives":[], "resources":[]}
}
```

The above JSON is **illustrative**, not existing live API responses. Only `Module 01` title is known here. A count of `1` published module is an *example*, **not** a statement that Module 01 is currently published. Actual values must be read from the database. Use UUIDs and timestamps in real schemas.

### Contract 02B — reserved (not for Phase 02A implementation)

| Method | Path | Role / constraint |
|---|---|---|
| GET | `/api/v1/me/enrollments` | Current student, own enrollments only |
| GET | `/api/v1/me/enrollments/{enrollment_id}/course` | Own active enrollment |
| GET | `/api/v1/instructor/cohorts` | Instructor; assigned cohorts only |
| GET | `/api/v1/instructor/cohorts/{cohort_id}/students` | Instructor assigned to this cohort, no unrelated users |
| GET | `/api/v1/admin/cohorts` | Manager/Admin |
| POST | `/api/v1/admin/cohorts` | Manager/Admin + step-up |
| POST | `/api/v1/admin/cohorts/{cohort_id}/instructors` | Manager/Admin + step-up; request `{user_id}` |
| POST | `/api/v1/admin/cohorts/{cohort_id}/enrollments` | Manager/Admin + step-up; request `{student_user_id}` |
| PATCH | `/api/v1/admin/enrollments/{enrollment_id}` | Manager/Admin + step-up; validated status transition |

### Contract 02C — reserved (not for Phase 02A implementation)

| Method | Path | Role / constraint |
|---|---|---|
| GET | `/api/v1/me/enrollments/{enrollment_id}/progress` | Own enrollment only; server-derived aggregate |
| PUT | `/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion` | Own active enrollment, published lesson; idempotent complete-only mutation |
| GET | `/api/v1/instructor/cohorts/{cohort_id}/progress` | Instructor assigned to cohort; aggregate with appropriate privacy |

**Example 02C completion request:** `{ "completed": true }`. It must not include `user_id`, `score`, `completed_at` or evaluation data. Reject or ignore unknown fields according to an explicit Pydantic policy, consistently tested.

## 6. Authorization invariants and security acceptance

1. A Student cannot list drafts or request the body of an unpublished lesson, even by guessing IDs.
2. A Student cannot access another student's roster/progress; authorization joins must use session `user.id` and enrollment association.
3. Instructor can read only cohorts to which they are actively assigned and their enrolled students; no access to other cohorts.
4. Manager/Admin edits enforce `authorize(..., sensitive=True)` and `require_origin` on each mutation; audits record actor/action/object/UTC time (expand audit schema only if justified).
5. A verified email is required before participation in formally assessed content. Until assessment implementation, choose and document whether unverified accounts can read enrolled lessons; default to require verification on enrollment.
6. No publication of an unreviewed lesson, orphaned module, invalid sequence, empty substantive lesson, or draft content ancestor.
7. Enrollments must not duplicate; concurrent requests preserve uniqueness and clear HTTP 409 behavior.
8. Content changes must not silently rewrite recorded completions. No client-supplied grade or clock time.
9. Same-origin Next.js proxy and trusted ingress controls must remain untouched unless a tested change is essential.
10. Use parameterized DB operations, input bounds, safe content rendering (sanitized Markdown), and a controlled resource URL policy.

## 7. Arena frontend brief (after 02A backend contract)

- Courses page shows the CEH v12 course with an honest `20 planned modules` and an accurate `N available modules`, where N is derived from the API; do not fabricate lessons or 19 other module titles.
- Course detail shows module sequence, publication/availability status, read-only introductory previews, clear locked/unavailable states where appropriate.
- Manager/Admin drafting UI: create/edit course, module, lesson; explicit publish confirmation; preview must not leak draft content to students.
- Instructor/student flows only show API-backed data; remaining previous demo telemetry stays visibly marked `DEMO PREVIEW` until replaced in later phases.
- Responsive layouts at 390/768/1440 widths; keyboard, focus, accessible alerts, RTL-readiness only if needed. Maintain current CyberLab visual style.
- Use `shared-contracts/openapi.json` **after DeepSeek regenerates it**; do not guess endpoint paths or invent mission scoring APIs.

## 8. DeepSeek Phase 02A definition of done

- One focused backend PR based on consolidated `main`, e.g. `deepseek/milestone-02a-catalog`.
- Alembic migration `0003_academic_catalog` (or equivalent) with downgrade, constraints and SQLite/PostgreSQL compatibility.
- Course/module/lesson/objective/resource models; read/write routers with role+resource permissions; stable DTO validation.
- Explicit draft/publish lifecycle, no accidental exposure of lesson bodies, no fake module contents.
- Seed strategy **idempotent and opt-in**; CEH v12 draft course metadata only, up to one verified draft Module 01 shell; no invented lesson content.
- Generate and commit updated `shared-contracts/openapi.json`; verify live parity and non-breaking legacy 01D contract.
- Focused tests for 01D authentication regression and 02A RBAC, sequence uniqueness, draft leaks, publish transitions, schema migration, and paging.
- Updated `AGENTS.md` / `README.md` agent ownership documentation without changing source responsibility for `frontend/`.
- PR report with exact migration, endpoints, test counts and known limitations. No frontend edits, no merge into `main`.

## 9. Codex QA budget and gates

For 02A, Codex should review only the PR diff, contract parity, one privileged publishing flow, a student draft-leak denial, the invalid sequence race, and migration up/down on PostgreSQL. Reuse GitHub CI for full regression. Stop early on a blocker; do not repeat full 01D browser workflows. Aim for a short report and conservative token consumption.

## 10. Decision log and future questions (do not block Phase 02A)

- **DECIDED:** CEH v12 is a course instance with 20 planned modules; only source Module 01 exists so far; other 19 remain unpopulated.
- **DECIDED:** No executable simulations or official scores in 02A; schemas should accommodate later missions without shipping empty behavior.
- **DECIDED:** Published catalog metadata can precede enrollment, but protected lesson content requires correct authorization.
- **DECIDED:** Backend owns final generated OpenAPI, Arena uses the committed contract; Codex does not implement source changes.
- **LATER:** Exact CEH content-import workflow, course licensing/provenance UI, grading policy, official assessments, and multiple CEH editions are separate approval points.
