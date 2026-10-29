# Milestone 02B — Frontend Report

Class, assignment and enrollment frontend built on the Milestone 02B cohort API.
Every screen renders real responses declared in `shared-contracts/openapi.json`
(API **0.4.0**, the authoritative contract). No class, roster or enrollment record
is ever simulated, seeded in the browser, or substituted with demonstration data.

- **Branch:** `arena/milestone-02b-frontend`
- **Base (stacked, not `main`):** `deepseek/milestone-02b-cohorts` (PR #10, unmerged)
  — now at `7789ad5`, merged into this branch in `d0e3715`
- **Commits:** `c241926` (implementation, tests and this report), `cd3b5d8` (report
  record), `d0e3715` (merge of backend `7789ad5`) + the roster correction described in
  §11
- **Pull request:** https://github.com/TechDaDev/cyberlab-academy/pull/11 — stacked on
  PR #10, **not merged**
- **Milestone 02A frontend:** preserved — the catalog, authoring, publication and
  step-up replay behaviour is unchanged (all 02A suites still pass).
- **Backend:** untouched by the frontend work. The new backend commit was integrated
  by merge only; no backend file, model, migration, test or generated contract was
  edited here.
- **Status:** implementation complete, verified locally, PR open for review. Not merged.

---

## 1. Screens and routes

| Route | Component | Access (active session role) | Purpose |
| --- | --- | --- | --- |
| `/academics/manage/cohorts` | `CohortManager` | Manager / Administrator | Class directory with server-side course + status filters, `limit`/`offset` paging, live instructor and enrollment counts, and draft creation |
| `/academics/manage/cohorts/[cohortId]` | `CohortDetail` | Manager / Administrator | One class: lifecycle, metadata, course association, instructor assignments and the enrollment roster |
| `/academics/teach` | `TeachingOverview` | Instructor | Classes with a live assignment to the signed-in account |
| `/academics/teach/[cohortId]` | `TeachingCohort` | Instructor | Assigned class roster and read-only course curriculum |
| `/academics/learn` | `LearningOverview` | Student | The student's own enrollments, active vs withdrawn |
| `/academics/learn/enrollments/[enrollmentId]` | `StudentEnrollment` | Student | One own enrollment: class status, course links, access state |

Every route is wrapped in `RoleRouteGuard`, which blocks the screen before any API
call is made. The guard is an affordance boundary only — the FastAPI backend
re-authorises every request, so hiding a route is never the security control.

`app/(authenticated)/academics/layout.tsx` now resolves its tabs by **longest
matching path prefix** and adds: "Classes" (manager/administrator), "Teaching"
(instructor) and "My Classes" (student). The name-forward navigation in
`features/roles/role-metadata.ts` gains the same entries for all four roles; students
and instructors never receive a `/academics/manage*` entry.

## 2. Endpoints integrated

All 18 Milestone 02B operations (14 new paths) plus the existing administrative user
directory, typed 1:1 against the contract. Paths are bare (`/admin/cohorts`),
prefixed by the existing same-origin proxy at `/api/v1`; no other host is contacted.

| Client method | Operation |
| --- | --- |
| `listCohorts(filters)` | `GET /admin/cohorts` (`course_id`, `status`, `limit`, `offset`) |
| `createCohort(body)` | `POST /admin/cohorts` — always creates a draft |
| `getCohort(id)` | `GET /admin/cohorts/{cohort_id}` |
| `updateCohort(id, body)` | `PATCH /admin/cohorts/{cohort_id}` — `name`, `starts_at`, `ends_at` only |
| `activateCohort(id)` | `POST /admin/cohorts/{cohort_id}/activate` (no body) |
| `completeCohort(id)` | `POST /admin/cohorts/{cohort_id}/complete` (no body) |
| `archiveCohort(id)` | `POST /admin/cohorts/{cohort_id}/archive` (no body) |
| `listCohortInstructors(id)` | `GET /admin/cohorts/{cohort_id}/instructors` |
| `assignCohortInstructor(id, userId)` | `POST /admin/cohorts/{cohort_id}/instructors` |
| `removeCohortInstructor(id, userId)` | `DELETE /admin/cohorts/{cohort_id}/instructors/{user_id}` → 204 |
| `listCohortEnrollments(id, filters)` | `GET /admin/cohorts/{cohort_id}/enrollments` |
| `createEnrollment(id, studentId)` | `POST /admin/cohorts/{cohort_id}/enrollments` |
| `updateEnrollment(enrollmentId, status)` | `PATCH /admin/enrollments/{enrollment_id}` |
| `listEligibleUsers(role, search)` | `GET /admin/users` (`role`, `active=true`, `search`) |
| `listTeachingCohorts(limit, offset)` | `GET /instructor/cohorts` |
| `getTeachingCohort(id)` | `GET /instructor/cohorts/{cohort_id}` |
| `listCohortRoster(id, limit, offset)` | `GET /instructor/cohorts/{cohort_id}/students` |
| `listOwnEnrollments(limit, offset)` | `GET /me/enrollments` |
| `getOwnEnrollmentCourse(id)` | `GET /me/enrollments/{enrollment_id}/course` |

`lib/api/cohorts.ts` contains **no preview-demo branch**. The admin directory is
called directly rather than through `adminApi.listUsers`, whose preview mode can
return fixtures — an operator must never be able to enroll a fabricated account into
a real class. An unreachable backend surfaces as `BACKEND_UNREACHABLE` and the
screens render an explicit unavailable state.

## 3. Components

### Data layer

- `lib/types/cohorts.ts` — the 17 contract schemas as TypeScript mirrors, plus
  `COHORT_LIMITS` (`^[A-Z0-9-]+$`, 2–40; name 1–160), `COHORT_PAGE_LIMITS`, and the
  status label maps used by badges.
- `lib/api/cohorts.ts` — `cohortsApi`, one method per operation, all through
  `apiRequest`. `removeCohortInstructor` resolves an explicit `{ removed: true }`
  marker after the 204 so a successful step-up replay is distinguishable from the
  `undefined` that a cancelled reauthentication returns.

### Behaviour

- `cohorts/cohort-lifecycle.ts` — the transition matrix
  (`draft → active → completed → archived`, plus `draft → archived`, no backward
  moves), transition copy, and the two activation gates as pure functions.
- `cohorts/cohort-validation.ts` — client mirror of `CohortCreate`/`CohortPatch`
  bounds, the `ends_at > starts_at` rule, and `datetime-local` ⇄ ISO conversion.
- `cohorts/cohort-errors.ts` — role-aware error copy, including the three different
  meanings of `404` (not found / not assigned / not your enrollment).
- `cohorts/user-picker.tsx` — name-or-email directory search filtered server-side by
  role and activity; no UUID field anywhere. Ineligible rows are annotated and their
  select action is disabled, but the API remains the authority.
- `cohorts/cohort-status-badge.tsx` — class, enrollment and assignment badges. The
  assignment badge renders the API's `active` flag verbatim.
- `cohorts/cohort-controls.tsx` — native select, summary tile and offset pagination
  driven by the server's `total`.

### Screens

- `cohorts/cohort-manager.tsx`, `cohorts/cohort-create-dialog.tsx`.
- `cohorts/cohort-detail.tsx` with `cohort-lifecycle-panel.tsx`,
  `cohort-metadata-form.tsx`, `cohort-instructor-panel.tsx`,
  `cohort-enrollment-panel.tsx`.
- `cohorts/teaching-overview.tsx`, `cohorts/teaching-cohort.tsx`.
- `cohorts/learning-overview.tsx`, `cohorts/student-enrollment.tsx`.

### Updated

- `features/academics/lesson-viewer.tsx` — the stale 02A "Phase 02B ships the
  academic catalog only" copy is gone. A `403` now renders a role-specific
  explanation (student: active enrollment in an active class; instructor: live
  assignment in an active class; manager/administrator: authoring workspace) with no
  bypass offered. An authorised `200` renders the authored body, objectives and
  references through the existing safe Markdown renderer.
- `features/roles/role-metadata.ts`, `app/(authenticated)/academics/layout.tsx` — 02B
  navigation and tabs.
- `__tests__/academic-catalog.test.tsx` — the two lesson-gate assertions now match
  the 02B copy and mock the active session role.

## 4. Role-specific experience

| Role | Can see | Cannot do |
| --- | --- | --- |
| Manager / Administrator | all classes including drafts, metadata, lifecycle actions, assignments, rosters | change `course_id` or `status` through `PATCH`; resurrect archived classes |
| Instructor | only classes with a live assignment: class status, roster, course curriculum | publish content, grade, take attendance, modify enrollments, or read another class |
| Student | only their own enrollments, class status, course and module links | self-enroll, read a roster, or read another learner's enrollment |
| Any other active role | the catalog (02A) | every 02B mutation — enforced by `RoleRouteGuard` and the API |

Role switching is handled by the existing `RoleRouteGuard` prompt: an account that
holds the target role may activate it; one that does not is told authorisation is
required. The API validates the *active* session role, never a stored preference.

## 5. Honesty guardrails

- Class, instructor and enrollment counts are the API's server-computed values
  (`active_instructor_count`, `active_enrollment_count`); the client never estimates
  them.
- Filters and paging are executed by the API. Nothing is filtered out of a
  downloaded page, so a record outside the current page cannot masquerade as absent.
- "Withdrawn" is shown as a retained record **without** access, never as an active
  class.
- Empty states are only rendered for successful empty responses. A failure renders
  an error state; an unreachable backend renders "Class service unavailable" and no
  records.
- No grading, attendance or progress surface exists, because those capabilities do
  not exist in the API. The instructor screen says so explicitly.
- The existing dashboard demonstration panels keep their `Demo` badges and are not
  reused as class or enrollment data.

## 6. Security posture

- **Authorisation is server-side.** Every route guard and every hidden control is an
  affordance only; all 18 operations are re-authorised by FastAPI. Lesson bodies are
  relationship-gated by the backend and are never fetched through an alternate path.
- **No caching after revocation.** `apiRequest` sends `cache: "no-store"`, the lesson
  viewer re-requests on every mount, and a `403` replaces any previously rendered
  body. Nothing is written to `localStorage`/`sessionStorage` (asserted by test).
- **Privileged mutations use step-up.** Class creation, metadata edits, all three
  transitions, assignment, removal and enrollment changes run through
  `useStepUpRetry`, which replays exactly once after reauthentication and treats a
  cancelled prompt as "no mutation".
- **204 vs cancellation.** `removeCohortInstructor` resolves `{ removed: true }`; the
  panel only reports success for that marker, so a cancelled reauthentication can
  never look like a completed removal.
- **Status cannot travel through `PATCH`.** `CohortPatch` accepts only three fields
  and the client sends only those; transitions use their dedicated endpoints.
- **No credential exposure.** Cookie-authenticated same-origin `/api/v1` proxy only;
  no tokens in storage, no absolute backend URLs in browser code.
- **Enrollment integrity.** Students cannot self-enroll: the student surface has no
  enrollment mutation at all, and duplicate/ineligible attempts are explained from
  the API's own `409` reason with a roster refresh.

## 7. Responsive and accessibility

- Tables scroll horizontally inside a card instead of breaking the layout; card grids
  collapse to one column on small screens.
- Every listing is a real `<table>` with `<caption class="sr-only">` and `scope`
  headers; sections have `aria-labelledby` headings.
- Confirmation dialogs reuse `ConfirmActionDialog` (focus trap, escape, labelled
  title/description); destructive actions use the destructive variant.
- Search inputs and filters have explicit `aria-label`/`<label>`; inline validation
  errors are wired with `aria-describedby` and `role="alert"`.
- Status is conveyed by text as well as colour (`.Draft`, `.Active`, `.Completed`,
  `.Archived`, `Enrolled`, `Withdrawn`).
- Light and dark themes both use the existing token set; no new palette was
  introduced.

## 8. Test results

Commands run from `frontend/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (no output) |
| `npm run lint` | pass (0 problems) |
| `npm run test` | **20 files, 181 tests, all passed** |
| `npm run build` | pass — 32 routes (6 new 02B routes) |

New suites (73 tests):

- `__tests__/cohort-management.test.tsx` (13) — class list rendering, server-side
  course/status filters, draft creation payload (and that `status` is never sent),
  code-pattern and date-window validation, unavailable-backend state, activation via
  the dedicated endpoint after confirmation, activation prerequisites (no eligible
  instructor, unpublished course), forward-only transitions incl. the archived
  terminal state, the API's `409` explanation inside the confirmation dialog,
  metadata payload restricted to `name`/`starts_at`/`ends_at`, and archived-class
  lockout.
- `__tests__/cohort-assignments-and-enrollment.test.tsx` (10) — current vs past
  assignments from the API's `active` flag, name-forward assignment through the
  directory, removal confirmation copy ("access revoked immediately"), cancelled
  step-up treated as neither success nor failure, enrollment through directory
  search plus roster refresh, duplicate `409` explanation plus refetch, unverified
  student blocked, withdrawal through the transition endpoint, reactivation blocked
  on a non-active class, and withdrawn rows rendered as records.
- `__tests__/cohort-teaching-and-learning.test.tsx` (16) — instructor sees only
  assigned classes (and never calls the admin directory), empty-assignment copy,
  roster with verification state, published-only curriculum links with module
  navigation, no publish/grade/attendance controls, `404` rendered as "not assigned",
  student's own enrollments with withdrawn ≠ access, per-enrollment detail routes,
  "students cannot self-enroll", granted/not-granted access states, another learner's
  enrollment concealed behind `404`, both role guards, the dual-role switch prompt,
  and the 02B navigation entries for all four roles (Demo badges preserved).
- `__tests__/cohort-lesson-access.test.tsx` (7) — authorised body/objectives/
  references render, embedded HTML stays inert text, student and instructor `403`
  explanations with the right destinations, manager routed to the authoring
  workspace, content dropped on the next visit after revocation with empty browser
  storage, and no stale Phase 02B wording in the viewer.
- `__tests__/cohort-step-up-replay.test.tsx` (4) — real `useStepUpRetry` +
  `AuthProvider` + `ReauthModal`: assignment replays once and refreshes once, a
  replayed `204` removal reports success (not a cancellation), a cancelled prompt
  replays nothing and reports nothing, and a failed replay surfaces the API error.
- `__tests__/cohort-contract.test.ts` (15) — contract version and 02B operation
  count, every client method's path/method, no bodies on transitions/delete/lookups,
  `CohortPatch` field set excludes status and the client never sends it,
  `CohortCreate` bounds mirror the form limits, assignment/enrollment body schemas,
  status enums, page defaults and nullable filters, exact response field sets, no
  preview-demo dependency, the directory query shape, the lifecycle matrix, and the
  real client mapping a `204` to `{ removed: true }` (with a non-2xx rejection case).

Existing 02A suites were otherwise untouched; the only edit is the two lesson-gate
assertions described in §3, which follow the intentional 02B copy change.

This is unit/SSR coverage with the API client mocked or the network stubbed. No
browser end-to-end run against a live FastAPI + Postgres stack was performed here.

## 9. Known limitations

- The administrative roster labels rows with `student_full_name`, which the API
  resolves from the student account on every read (§11). The user id is shown as
  secondary technical detail; no email or other personal field is exposed by the
  administrative enrollment view.
- `GET /admin/users` has no pagination; eligibility search therefore returns the
  server's filtered set for the typed query and the picker renders it as-is.
- Class metadata beyond name/date window (capacity, location, syllabus) has no
  contract support and is not offered.
- Instructors can be reassigned from the history list, but a class with no live
  instructor shows the activation blocker rather than a shortcut form.
- No grading, attendance, progress or certificate surfaces exist in this milestone.
- Verification is unit/SSR only; no browser E2E against a running backend was run in
  this environment, and no backend behaviour was modified to make the UI pass.

## 10. Running locally

```bash
# Backend (repository root) — requires Postgres per backend/README
uvicorn app.main:app --reload --port 8000   # from backend/

# Frontend
cd frontend
npm ci
npm run dev                                  # http://localhost:3000
```

`CYBERLAB_BACKEND_URL` (server-side) points the `/api/v1` proxy at FastAPI. Without
it the class screens show their unavailable state; they never fall back to fixtures.

## 11. QA correction — authoritative roster names

Codex's independent integration QA returned **PASS WITH LIMITATIONS**. The one
functional limitation was that the administrative roster showed raw student UUIDs
after a reload: `EnrollmentPublic` carried `student_user_id` only, so the panel kept
the names it had seen in a local `knownNames` state object — memory that is empty in
a fresh browser tab.

DeepSeek resolved it in the backend (`7789ad5`, merged here in `d0e3715`): the
administrative enrollment view now returns a **required, server-derived**
`student_full_name` on the `GET`, `POST` and `PATCH` responses. The contract change is
additive — one property on `EnrollmentPublic`, no path or operation changed, API
version still 0.4.0 — and `StudentEnrollmentPublic` is unchanged.

### Files changed

| File | Change |
| --- | --- |
| `backend/*`, `shared-contracts/openapi.json` | not edited here; brought in by the merge of `7789ad5` |
| `frontend/lib/types/cohorts.ts` | `EnrollmentPublic.student_full_name: string` (required), with the read-only/administrative scope documented |
| `frontend/features/academics/cohorts/cohort-enrollment-panel.tsx` | `knownNames` state, `setKnownNames` and the id-only fallback removed; rows render `enrollment.student_full_name` as the primary label with `student_user_id` as secondary technical detail |
| `frontend/__tests__/cohort-enrollment-roster.test.tsx` | new focused suite (7 tests) |
| `frontend/__tests__/cohort-assignments-and-enrollment.test.tsx` | fixtures carry the new required field |
| `frontend/__tests__/cohort-contract.test.ts` | guards the new field, its required status, and that it is never sent |

### Behaviour

- The name always comes from the response payload. Nothing is remembered between
  renders, so a reopened page, a refreshed roster and a brand-new browser tab all show
  names.
- A profile rename is reflected on the next read, because the server resolves the name
  each time the roster is fetched.
- Withdrawal and reactivation keep the same label; only the status badge changes.
- No directory request is made to resolve names, and the field is never sent back:
  `POST /admin/cohorts/{id}/enrollments` still carries `student_user_id` only (sending
  `student_full_name` would be a `422`), and the `PATCH` transition carries `status`
  only.
- Everything else is untouched: enrollment authorization, instructor assignment,
  lifecycle transitions, self-enrollment prohibition, lesson gating, step-up replay,
  `204` removal handling and role-based navigation.

### Verification

Commands run from `frontend/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (no output) |
| `npm run lint` | pass (0 problems) |
| focused cohort suites (7 files) | pass — 73 tests |
| `npm run test` | **20 files, 181 tests, all passed** |
| `npm run build` | pass — 32 routes (unchanged) |

`__tests__/cohort-enrollment-roster.test.tsx` (7 tests) covers the correction points
directly: an existing enrollment is labelled from `student_full_name` with no directory
call, the name survives an unmount/remount, a renamed student updates on reload,
withdrawal and reactivation preserve the label (and the transition body stays
`status`-only), the panel source contains no `knownNames` cache, enrollment requests
carry only `student_user_id`, and the student-facing schema is asserted to have no
`student_full_name`.

This is a self-verified correction. No second independent Codex QA run has been
performed on it, and none is claimed here.
