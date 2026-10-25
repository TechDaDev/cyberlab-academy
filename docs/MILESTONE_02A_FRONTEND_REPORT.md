# Milestone 02A — Frontend Report

Academic catalog and content-authoring frontend built on the Milestone 02A FastAPI
catalog. Everything on screen is derived from real API responses declared in
`shared-contracts/openapi.json` (API **0.3.0**, the authoritative contract). No
curriculum content is generated, simulated or cached in the browser.

- **Branch:** `arena/milestone-02a-frontend`
- **Base (stacked, not `main`):** `deepseek/milestone-02a-catalog` (`e917cb0`, PR #8)
- **Commits:** `ac434c8` (implementation and tests), `bfc36f8` (initial report),
  `6879bfa` (step-up replay correction, see §11) + the commit that updates this report
- **Pull request:** https://github.com/TechDaDev/cyberlab-academy/pull/9
- **Backend:** untouched. No backend file, test, migration, auth or security code was modified.

---

## 1. Screens and routes

| Route | Screen | Access | Purpose |
| --- | --- | --- | --- |
| `/academics` | `CourseCatalog` | any authenticated role | Published courses, code + edition, summary, planned vs published module counts, availability, published-module roll-up table |
| `/academics/courses/[courseId]` | `CourseOverview` | any authenticated role | Course hero stats, published modules in authoritative sequence, notice for un-authored positions, manager shortcut |
| `/academics/modules/[moduleId]` | `ModuleExplorer` | any authenticated role | Module metadata, published lessons in sequence, explicit "no missions or assessments" notice |
| `/academics/lessons/[lessonId]` | `LessonViewer` | body only for content managers in 02A | Renders the authored body, objectives and resources; `403` renders the enrollment-gate panel |
| `/academics/manage` | `ContentManager` | active Manager / Administrator | All courses including drafts, page counters, "New course draft" |
| `/academics/manage/courses/[courseId]` | `CourseEditor` | active Manager / Administrator | Course metadata `PATCH`, module list with draft/published state, module creation, module publication, course publication |
| `/academics/manage/modules/[moduleId]` | `ModuleEditor` | active Manager / Administrator | Module metadata + sequence `PATCH`, ordered lesson list, lesson creation, module publication |
| `/academics/manage/lessons/[lessonId]` | `LessonEditor` | active Manager / Administrator | Title/sequence, Markdown body with live preview, objectives, resource references, explicit save + publish |

A shared `app/(authenticated)/academics/layout.tsx` provides the section heading and
role-aware tabs ("Course Catalog", plus "Content Management" only for manager and
administrator sessions), with `aria-current="page"` on the active tab. The
"Content Management" tab is additionally hidden on `/academics/manage*` navigation
patterns resolved by exact/base matching.

## 2. Endpoints integrated

All 18 documented operations, typed 1:1 against the contract. Paths are bare
(`/courses`), prefixed by the existing same-origin proxy at `/api/v1`.

| Client method | Operation |
| --- | --- |
| `listCourses` | `GET /courses` (`limit` 1–100, `offset` ≥ 0) |
| `getCourse` | `GET /courses/{course_id}` |
| `listCourseModules` | `GET /courses/{course_id}/modules` |
| `getModule` | `GET /modules/{module_id}` |
| `listModuleLessons` | `GET /modules/{module_id}/lessons` |
| `getLesson` | `GET /lessons/{lesson_id}` (403 for students and instructors) |
| `listAdminCourses` | `GET /admin/courses` |
| `createCourse` | `POST /admin/courses` |
| `getAdminCourse` | `GET /admin/courses/{course_id}` |
| `updateCourse` | `PATCH /admin/courses/{course_id}` |
| `publishCourse` | `POST /admin/courses/{course_id}/publish` |
| `listAdminModules` | `GET /admin/courses/{course_id}/modules` |
| `createModule` | `POST /admin/courses/{course_id}/modules` |
| `updateModule` | `PATCH /admin/modules/{module_id}` |
| `publishModule` | `POST /admin/modules/{module_id}/publish` |
| `createLesson` | `POST /admin/modules/{module_id}/lessons` |
| `updateLesson` | `PATCH /admin/lessons/{lesson_id}` |
| `publishLesson` | `POST /admin/lessons/{lesson_id}/publish` |

`lib/api/academic.ts` deliberately has **no** `preview-demo` branch. `lib/api/admin.ts`
can serve fixtures when the app runs in preview-demo mode; curriculum must never do
that, so an unreachable backend produces an honest "unavailable" state instead of
plausible-looking fake courses.

## 3. Components

### New — data layer

| File | Contents |
| --- | --- |
| `lib/types/academic.ts` | TS mirrors of `CoursePublic`, `ModulePublic`, `LessonSummary`, `LessonDetail`, `ObjectivePublic`, `ResourcePublic`, `PageCourses`, the five request bodies, plus `COURSE_LIMITS`, `MODULE_LIMITS`, `LESSON_LIMITS`, `COURSE_PAGE_LIMITS`, `RESOURCE_TYPE_LABELS`, `CONTENT_STATUS_LABELS` |
| `lib/api/academic.ts` | `academicApi` — 18 operations over the existing `apiRequest` client |

### New — shared behaviour

| File | Purpose |
| --- | --- |
| `features/academics/use-api-resource.ts` | Request-identity based loader (`data`, `error`, `loading`, `refreshing`, `reload`); reload keeps the previous data on screen; written to satisfy the project's React Compiler lint rules without setState-in-effect |
| `features/academics/error-message.ts` | `describeAcademicError` → titles/copy for 401/403/404/409/422/503/unreachable; keeps "empty result" distinct from "could not load" |
| `features/academics/use-step-up-retry.ts` | Routes `ApiError.stepUpReason` through the existing `requestStepUp` modal and re-issues the same mutation |
| `features/academics/validation.ts` | Client validators mirroring the OpenAPI bounds, `normalizeObjectives`, `normalizeResources` |
| `features/academics/field.tsx` | `Field` render-prop control wiring `aria-invalid` / `aria-describedby`, plus `FormError` |
| `features/academics/markdown.tsx` | Dependency-free Markdown renderer: AST → React elements, no `dangerouslySetInnerHTML`, only absolute `http(s)` links become anchors (`rel="noopener noreferrer nofollow"`), raw HTML displayed as text |
| `features/academics/content-status-badge.tsx` | `ContentStatusBadge` (draft/published/archived), `ResourceTypeBadge` |
| `features/academics/role-access.ts` | `CONTENT_MANAGER_ROLES`, `isContentManager` — rendering only, never the authorization boundary |
| `components/shared/confirm-action-dialog.tsx` | Body-less confirmation dialog for publish actions (the publish endpoints accept no payload) |

### New — screens

`course-catalog.tsx`, `course-overview.tsx`, `module-explorer.tsx`, `lesson-viewer.tsx`,
`content-manager.tsx`, `course-editor.tsx`, `module-editor.tsx`, `lesson-editor.tsx`,
`course-create-dialog.tsx`, `module-create-dialog.tsx`, `catalog-views.tsx` (client
bridge that injects the active role into the server-rendered route files).

### Updated

| File | Change |
| --- | --- |
| `features/roles/role-metadata.ts` | Added an "Academic Catalog" nav section per role via `getNavigationForRole` and two Lucide icons. Existing primary sections, demo badges and the Account & Security section are unchanged |

No design-system component was modified; the palette, typography, cards, tables,
badges, dialogs and spacing are the existing ones.

## 4. Role-specific experience

| Role | Sees |
| --- | --- |
| Student | Catalog + course overview + module explorer; lesson bodies return `403` → explains that enrollment arrives in Phase 02B. Navigation: *Course Catalog*, *Available Modules* |
| Instructor | Same catalog reads; lesson bodies are also `403` until cohort assignment exists. Navigation: *Course Catalog*, *Curriculum Explorer* |
| Manager | Catalog plus *Content Management*: draft courses, modules and lessons, sequencing, publication. Still cannot read lesson bodies through the learner route unless their active role is a content-manager role |
| Administrator | Same authoring rights as Manager, including MFA-backed step-up |

Route files for the authoring workspace are wrapped in `RoleRouteGuard`
(`requiredRoles={["manager","administrator"]}`), which offers the existing
role-switch/step-up UX instead of a bare error. The API remains the authority: every
mutating request is step-up protected and origin-checked server-side.

## 5. Honesty guardrails

- **CEH v12** shows exactly what the API reports at that moment. `python -m app.seed_catalog`
  creates a **draft** course (`planned_module_count = 20`) plus a single **draft**
  Module 01 shell — no published modules and no lessons. Immediately after seeding,
  therefore, the public catalog is empty (drafts are not listed) and Content Management
  shows the draft course at `0 / 20` published modules with one draft module. The counts
  become `1 / 20` only after an operator authors a lesson and publishes the lesson, the
  module and the course. The UI never derives, rounds up or pre-fills these numbers, and
  positions 02–20 are never listed, titled or summarised; the overview states that the
  remaining positions are unavailable and that their titles are not fabricated.
- The catalog's module table only contains modules the API returned.
- `LessonViewer` shows *no* lesson text on `403` — no excerpt, no placeholder body.
- The module explorer states that mission briefings, labs and assessments are not part
  of Milestone 02A and that no API can record results.
- Draft courses are only reachable in the authoring workspace; a draft in the public
  catalog is indistinguishable from "not found", and the UI says so.
- Backend failures render a title/description from the actual error, never a fallback
  fixture.

## 6. Security posture

- Reuses the existing session cookie auth, `apiRequest`, CSRF/Origin protection and
  `/api/v1` proxy. No new credential storage; nothing is written to
  `localStorage`/`sessionStorage`.
- Status transitions exist only on the three `publish` endpoints; `PATCH` bodies carry
  metadata, never `status`, `published_at` or `content_version` (enforced by a test).
- Publish requests send no body, matching `extra="forbid"`.
- Step-up (`403 … recent authentication/MFA required`) opens the existing
  reauthentication modal and replays the mutation; it is never swallowed as a
  validation error. The caller stays suspended until the flow settles, so the success
  handler still runs (see §11).
- Every error surface is `role="alert"` or an `Alert` with a translated message.
- Markdown is rendered to React elements, so embedded `<script>`/`onclick` cannot
  execute; non-http(s) link targets stay inert.

## 7. Responsive and accessibility

- Catalog cards: 1 column, `md:2`, `xl:3`; editors: single column on mobile, `lg:`
  5/7 and 8/4 splits on desktop; the module table is wrapped in `overflow-x-auto` with
  a `min-w-[36rem]` min-width so it scrolls rather than overflowing the viewport.
- Toolbars and badges use `flex-wrap`; headings use `text-2xl` → `sm:text-3xl`.
- `aria-current="page"` on the active section tab; labelled `<table>` with
  `scope="col"` headers; `role="progressbar"` with `aria-valuenow`/`aria-valuemax` and
  an accessible label for planned-vs-published counts.
- Every form control is associated with a label via `Field`, carrying
  `aria-invalid` and `aria-describedby` for hints and inline errors; icon-only
  buttons have `aria-label`s; dialogs have titles and descriptions.
- Focus-visible rings come from the existing button/input primitives; the editors keep
  the dark midnight/cyan identity and work in both themes.

## 8. Test results

Commands run from `frontend/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (no output) |
| `npm run lint` | pass (0 problems) |
| `npm run test` | **13 files, 103 tests, all passed** |
| `npm run build` | pass — 26 routes (8 new academic routes) |
| `npm audit` | 0 vulnerabilities (unchanged) |

New suites (34 tests):

- `__tests__/academic-catalog.test.tsx` (13) — catalog rendering, planned vs published
  counts, module roll-up links, empty catalog, 503 handling, curriculum sequence and
  missing-position notice, empty module list, module→lesson navigation, 403 lesson
  gate (and that no body is rendered), permitted lesson read, Markdown safety
  (scripts, `javascript:` links, empty body).
- `__tests__/academic-authoring.test.tsx` (17) — draft course retrieval, seed hint,
  exact `CourseCreate` payload, client validation, duplicate-code 409, draft course
  editor with blocked module publication, explicit course publish, draft module
  retrieval, duplicate-sequence 409 as a field error, module publish confirmation,
  lesson save payload/normalisation, live Markdown preview, lesson publish, student
  blocked from `/academics/manage` without an admin API call, manager access, and role
  navigation for all four roles including preserved `Demo` badges.
- `__tests__/academic-step-up-replay.test.tsx` (4) — the real `useStepUpRetry` hook,
  `AuthProvider` and `ReauthModal` against stubbed network responses: creation
  succeeds after verification and refreshes the list exactly once, publication
  succeeds and shows the new status, cancellation never executes the mutation, and a
  failed replay surfaces the API error while keeping the form. Three of these four
  fail against the pre-correction hook (see §11).
- `__tests__/academic-contract.test.ts` (9) — every client method maps to the
  documented path and HTTP method in `shared-contracts/openapi.json`; publish
  operations have no request body; no status fields in PATCH payloads; no
  preview-demo dependency; form limits equal the schema bounds; resource type enum
  parity; lesson list schema excludes `body_markdown`.

Existing suites were not modified and still pass.

A production-build smoke check started the Next server and requested all eight new
routes plus `/dashboard/manager`: all returned `200` with no server error. This is an
SSR check only — it does not validate authenticated data rendering, because no
FastAPI backend was running in this environment.

## 9. Known limitations

- **No archive/delete affordances.** The contract has no delete or archive endpoint,
  so the `archived` status is displayed but cannot be reached from the UI.
- **Objectives and resources are replaced wholesale.** There is no per-objective or
  per-resource endpoint, so editing sends the full ordered list; reordering is manual.
- **Lesson bodies stay locked for students and instructors** until enrollment and
  cohort assignment arrive in Phase 02B. The panel explains this and offers no
  workaround.
- **Draft visibility follows the active role.** A manager who switches their session
  to `student` loses access to drafts (the API enforces it); the UI re-renders without
  the authoring tab.
- **Publication dependencies are explained, not enforced client-side.** Publishing a
  module before a lesson exists reaches the API and returns `409`; the message is
  surfaced verbatim in the dialog/alert.
- **`planned_module_count` shrink conflicts** return `409` on the course `PATCH`; the
  detail is shown as a form-level error rather than attributed to the field.
- **Pagination is offset-based** with a page size of 9 in both lists (contract maximum
  100). No server-side filtering/sorting is offered because the contract exposes none.
- **Verification is unit/integration level.** Screens are tested with jsdom and a
  mocked academic client; no automated browser end-to-end run against a live FastAPI
  backend was performed in this environment.
- **Responsive behaviour is design-level.** Layout breakpoints follow the existing
  shell patterns, but no new screenshot sweep was captured for these routes.

## 10. Running locally

```bash
# Backend (repository root)
cd backend
python -m app.seed_catalog          # draft CEH-V12 course (20 planned) + draft Module 01 shell;
                                    # no lessons and no published modules until you publish them
uvicorn app.main:app --reload

# Frontend
cd frontend
npm ci
CYBERLAB_BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

Sign in with an account holding `manager` or `administrator`, activate that role, then
open `/academics` and `/academics/manage`. Without a reachable backend the catalog
shows an explicit "unavailable" state — never demo curriculum.

## 11. Review correction — step-up mutation replay

Review found one integration defect in the step-up path. It is fixed in commit
`6879bfa` on the same branch and PR (#9).

### Root cause

`useStepUpRetry` replayed the mutation inside the reauthentication modal's
`onSuccess` callback and returned `undefined` to the caller immediately after
opening the prompt:

```ts
onSuccess: async () => { await action(); },   // result discarded
return undefined;                             // caller resumes here
```

Nothing awaited the verification flow, and the replay's return value had nowhere to
go. Consequences:

- The mutation **did** execute against PostgreSQL after verification, but the caller's
  success handler never ran: creation dialogs stayed open, publish confirmation
  dialogs stayed open, success toasts never appeared, and lists were never refreshed,
  so the UI kept showing pre-request versions and statuses.
- The caller's `finally` block re-enabled its submit button while the modal was still
  open, allowing a second submission attempt.
- A failed replay threw inside the modal's `catch`, after the modal had already
  cleared its state — the error was rendered into a closed dialog and the operator saw
  nothing.

### Files changed

| File | Change |
| --- | --- |
| `frontend/features/academics/use-step-up-retry.ts` | Rewritten: the promise stays pending across the verification flow and is settled by the replay; cancellation and failure are represented explicitly |
| `frontend/features/auth/auth-context.tsx` | `requestStepUp` accepts an optional `onCancel`; `StepUpPromptState` carries it as `onCancelCallback`. No change to session, MFA or cookie behaviour |
| `frontend/features/auth/reauth-modal.tsx` | `resetAndClose` distinguishes "dismissed" from "verified", notifying `onCancelCallback` only on dismissal (Cancel, Escape, overlay, MFA-enrolment link). The post-verification path is unchanged |
| `frontend/__tests__/academic-step-up-replay.test.tsx` | New regression suite for the real hook, context and modal |

Editor and dialog call sites were **not** modified: `runWithStepUp` keeps its
`Promise<T | undefined>` signature, so `const created = await runWithStepUp(...)` and
the existing `if (created) { … }` success blocks now work as originally intended.

### Corrected behaviour

1. The mutation is attempted; a non-step-up error rejects immediately, as before.
2. A step-up `403` opens the prompt and leaves the caller suspended — submit buttons
   stay disabled, forms stay populated.
3. After successful verification the replay runs **once** (`replayStarted` guard), and:
   - **success** → the promise resolves with the mutation result, so the caller's
     success handler runs exactly once: dialog closes, success toast/notice, list and
     status refresh, updated `content_version`;
   - **failure** → the promise rejects with the real API error, the caller's `catch`
     renders it inline (form-level or dialog alert), the form data is preserved and no
     success feedback is shown;
   - **cancellation** → the promise resolves `undefined`, the mutation is never
     issued, nothing is reported as saved, and the form keeps its values.
4. Cancellation is reported by the modal itself (all dismissal routes) and covered by
   a safety net for closes that bypass it (session cleared elsewhere, unmount). The
   replay flag is set synchronously before the request, so the close that follows a
   successful verification can never be mistaken for a cancellation — and a
   cancellation that races an in-flight verification prevents the replay instead of
   letting it run unobserved.

MFA enforcement, the reauthentication endpoint, cookie handling and the step-up
`reason` resolution are untouched.

### Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm run test` | **13 files, 103 tests, all passed** |
| `npm run build` | pass — 26 routes |
| Targeted regression check | the 4 new tests **fail 3/4** against the pre-correction hook (`bfc36f8`) and pass 4/4 with the fix |

The regression suite covers the five required scenarios: course creation after
verification, the success callback running once (one replay, one refresh, one
confirmation message), the created course appearing in the refreshed list, publication
after verification with the updated status, cancellation not executing the mutation,
and a failed replay surfacing the API error with the form intact.
