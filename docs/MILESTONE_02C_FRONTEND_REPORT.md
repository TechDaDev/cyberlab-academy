# Milestone 02C — Frontend Report

Lesson completion and academic progress, built on the Milestone 02C progress API.
Every number on these screens comes from `shared-contracts/openapi.json`
(API **0.5.0**, the authoritative contract). No progress record, percentage,
average or lesson state is computed in the browser, seeded locally, or substituted
with demonstration data.

- **Branch:** `arena/09c43e9e-cyberlab-academy` (Arena session branch; the intended
  stacked branch name is `arena/milestone-02c-frontend`, see §10)
- **Base (stacked, not `main`):** `deepseek/milestone-02c-progress` at `8142094`
  (PR #12, unmerged)
- **Implementation commit:** `b08583c` — implementation, tests and contract-guard
  update; this report is the following commit
- **Pull request:** stacked on `deepseek/milestone-02c-progress`; **not merged**
- **Milestone 01D / 02A / 02B:** preserved — authentication, active-role switching,
  catalog authoring and publication, class management, instructor assignments,
  enrollment, lesson authorization, step-up reauthentication, the `204` instructor
  removal flow, navigation and the design system are untouched. All 02A/02B suites
  still pass.
- **Backend:** untouched by this work. No backend file, model, migration, test or
  generated contract was edited; `shared-contracts/openapi.json` is read only.
- **Status:** implementation complete, verified locally. PR open for review. Not merged.

Completion is a student's own statement that they reviewed a lesson. It is
self-reported learning progress — **not** a score, grade, competency result or
certification, and it is labelled that way everywhere it appears.

---

## 1. Screens and routes

| Route | Component | 02C addition |
| --- | --- | --- |
| `/academics/learn` | `features/academics/cohorts/learning-overview.tsx` | Per-enrollment progress summary inside each class card: course title, class, completed / total published lessons, backend percentage, needs-review count, and withdrawn/inactive copy that removes eligibility |
| `/academics/learn/enrollments/[enrollmentId]` | `features/academics/cohorts/student-enrollment.tsx` → `StudentProgressPanel` | Progress section: overall percentage and bar, module roll-ups, published/completed counts, needs-review total, per-lesson states (not started / completed / needs review) with text labels, and a refresh action |
| `/academics/lessons/[lessonId]` | `features/academics/lesson-viewer.tsx` → `LessonCompletionControl` | **Mark Lesson Complete**, completion confirmation with server timestamp, authoritative refetch, no un-complete |
| `/academics/modules/[moduleId]` | `features/academics/module-explorer.tsx` | Lesson links carry the class context (`?enrollmentId=…`) when the module was opened from a class |
| `/academics/teach/[cohortId]` | `features/academics/cohorts/teaching-cohort.tsx` → `ClassProgressPanel` | Instructor class report: class average, active enrollments, published lessons, paginated student table |
| `/academics/manage/cohorts/[cohortId]` | `features/academics/cohorts/cohort-detail.tsx` → `ClassProgressPanel` | Same report against the admin endpoint, read-only, no step-up |

No route was added or removed: the 32-route build is unchanged. Server route files
stay metadata-only; the lesson and module pages now forward `searchParams.enrollmentId`
(a string, or `null`) into the client components without resolving anything.

## 2. Endpoints integrated

| Method | Path | Client method | Where |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me/enrollments/{enrollment_id}/progress` | `progressApi.getOwnProgress` | Class list, enrollment detail, lesson completion control |
| `PUT` | `/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion` | `progressApi.completeLesson` | Lesson viewer |
| `GET` | `/api/v1/instructor/cohorts/{cohort_id}/progress?limit&offset` | `progressApi.getInstructorClassProgress` | Instructor class page |
| `GET` | `/api/v1/admin/cohorts/{cohort_id}/progress?limit&offset` | `progressApi.getAdminClassProgress` | Manager class page |

All four go through the existing same-origin client (`/api/v1`, cookie session,
`credentials: "include"`). There is **no** preview-demo branch in
`lib/api/progress.ts`: unlike catalog data, a fabricated percentage next to a real
class would misrepresent a learner's record, so an unreachable backend surfaces as
`BACKEND_UNREACHABLE` and the screen says progress is unavailable.

The completion body is a module constant, `{ "completed": true }`. The endpoint
rejects `false`, a score, a percentage, a timestamp, a client `lesson_version` or a
foreign id with `422` (`extra="forbid"`), so the body is never assembled per call and
is never parameterised by lesson metadata.

Pagination uses the documented bounds (`limit` default 30, 1–100; `offset` ≥ 0),
mirrored as `PROGRESS_PAGE_LIMITS`.

## 3. Components

### Data layer

- `lib/types/progress.ts` — mirrors of all nine 0.5.0 schemas, the completion-state
  labels, `PROGRESS_PAGE_LIMITS`, `formatPercent` (one decimal, formatting only) and
  `formatLessonCounts`. Two runtime guards (`isEnrollmentProgress`, `isClassProgress`)
  let a screen say "progress unavailable" rather than print a field it never received.
- `lib/api/progress.ts` — the four operations, no demo branch, no browser storage.
- `features/academics/progress/progress-session.ts` — `useProgressSessionKey()`
  (account id + active role) and `useSessionGuard()` (discard a response that belongs
  to a previous session).

### Behaviour

- `lesson-completion-control.tsx` — the only completion writer. Renders nothing but
  an explanation when there is no explicit enrollment, no button when the lesson is
  not in that enrollment's course, no button for a withdrawn enrollment or an
  inactive class, and calls the endpoint at most once per click.
- `student-progress-panel.tsx` — overall + module + per-lesson progress for one
  enrollment, with its own refresh.
- `class-progress-panel.tsx` — one component for both reporting surfaces
  (`surface="instructor" | "manager"` selects the endpoint and the error copy).
- `enrollment-progress-summary.tsx` — compact per-card progress on the class list; a
  failure is scoped to its own card.
- `completion-status-badge.tsx` — state badge plus the `needs_review` explanation
  ("Content updated — review this lesson again." with `last_completed_version`).
- `progress-errors.ts` — error copy keyed by surface, plus completion-specific copy
  that always states nothing was recorded.
- `components/shared/progress-bar.tsx` — `role="progressbar"` with
  `aria-valuemin/max/now/valuetext`, cyan→teal gradient, optional amber tone when a
  lesson needs review. Percentages are passed in; nothing is derived here.

### Updated

`learning-overview.tsx`, `student-enrollment.tsx`, `lesson-viewer.tsx`,
`module-explorer.tsx`, `catalog-views.tsx`, `teaching-cohort.tsx`,
`cohort-detail.tsx`, the lesson and module route pages, and the 02B contract guard
(now pins 0.5.0 and excludes the four 02C routes it does not own).

## 4. Completion workflow

1. The student opens a lesson from a class surface, so the URL carries
   `?enrollmentId=…`; the class list, enrollment detail and module links all keep it.
2. The control reads `GET /me/enrollments/{id}/progress` for **that** enrollment and
   looks up this lesson in `lessons[]`.
   - missing entry → the lesson is not part of that enrollment's course → no control;
   - `not_started` → **Mark Lesson Complete**;
   - `needs_review` → "Content updated — review this lesson again." plus the same
     button, because re-completing is the same call;
   - `current` → **Completed** with the server timestamp, the action replaced by an
     explanation (there is no un-complete toggle).
3. Clicking sends `PUT …/{lesson_id}/completion` with `{ "completed": true }`. The
   button is disabled and relabelled while the request is in flight, so a double
   click cannot produce two requests.
4. Both success statuses are success. `apiRequest` resolves the parsed body for any
   2xx and the body's `newly_recorded` distinguishes them: `true` → "Lesson
   completed" for the current version; `false` → "This version was already completed
   — the original timestamp is kept". Neither is an error, and neither writes a
   second timestamp.
5. On success the panel is re-read from the API, so the indicator, the counts, the
   module roll-up and the percentage reflect authoritative values, and the
   confirmation line shows the response's `completed_at`.
6. A failure (401/403/404/422/503) renders "Completion not recorded" with the API's
   own explanation. Nothing is optimistically flipped, and no progress is re-read to
   fake a change.
7. If the lesson is edited afterwards, the server bumps `content_version`; the next
   read reports `needs_review`, which is never rendered as completed. The previous
   completion stays visible through `last_completed_version`, and the client never
   constructs or submits a lesson version.

## 5. Enrollment context

- One enrollment is one progress scope. Two classes of the same course keep separate
  records, and completion in one is never shown as credit in the other.
- The context is always explicit (`?enrollmentId=`). Nothing guesses an enrollment,
  picks the first one, or takes one from a list — the lesson viewer accepts a single
  string and treats an absent value as "no context".
- The query parameter is **not** authorization. It only selects which of the
  caller's own enrollments to read: the progress endpoint itself answers `404` for
  another learner's enrollment, and the completion endpoint re-validates ownership,
  enrollment status, class status and the course/lesson relationship on every call.
- Without context the lesson body still renders (access is granted by the API on its
  own terms), but the completion control is replaced by "Completion needs a class"
  with a link back to the class list.
- A lesson that is not in the enrollment's course produces an explicit mismatch
  message rather than a button.

## 6. Reporting (instructor and manager)

- `GET /instructor/cohorts/{id}/progress` for a live assignment; anything else is
  `404` and the panel says "You do not have a live teaching assignment for this
  class" instead of showing an empty class.
- `GET /admin/cohorts/{id}/progress` renders the identical payload through the same
  component. It is read-only and needs no fresh step-up, so reporting keeps working
  after an idle period.
- The class average is the backend's whole-class figure, computed over every active
  enrollment before pagination. The panel never averages the visible rows, and it
  does not change while paging.
- Withdrawn rows stay in the table, carry the `Withdrawn` badge and the line
  "Excluded from class average".
- Copy is explicit: "Self-reported learning progress … not grades, and not a
  competency score". No instructor or manager completion, grading or attendance
  control exists, because none exists in the API.

## 7. Security and session handling

- Active-role enforcement is unchanged and server-side; the client only decides what
  to render for the current role. Instructor and manager screens never call the
  student endpoints, and the student screens never call the class endpoints.
- Role scoping is visible in the keys: `useProgressSessionKey()` includes the account
  id **and** the active role, so switching role, signing out or signing in as
  somebody else changes the request identity immediately. `useApiResource` drops the
  previous record on a key change and cancels the in-flight request, so a stale
  response cannot paint progress for the new session.
- In-flight completions are guarded the same way: a response that arrives after the
  session changed is discarded (no toast, no state write).
- Progress and lesson content are never written to `localStorage` or
  `sessionStorage`; a test renders both surfaces and asserts both stores stay empty.
- Errors are surfaced per status: `401` session expired, `403` not permitted with the
  API's detail, `404` concealed as "not your enrollment" / "not assigned", `422`
  completion not recorded, `503`/unreachable retryable.
- A withdrawn enrollment keeps its history readable but loses eligibility; a removed
  instructor assignment loses the class report on the next request. Nothing is cached
  that could outlive either.

## 8. Design, responsive and accessibility

- Same design system: cyber-panel cards, `SummaryTile`, badges, tables, the
  cyan/teal gradient bar. No new visual language and no redesign.
- Every state is labelled in words as well as colour: "Not started", "Completed",
  "Needs review" badges, the "Content updated — review this lesson again." hint, and
  `aria-valuetext` carrying "66.7% — 2 of 3 published lessons completed".
- Progress bars expose `role="progressbar"` with min/max/now and an accessible name
  per student, per module and per class average.
- Tables scroll horizontally on narrow viewports (`overflow-x-auto`, `min-w-*`) and
  every table has a caption describing self-reported progress.
- Demo-labelled panels elsewhere (missions, grading, assessments) are untouched and
  stay labelled DEMO. Completion is never substituted for a competency score.

## 9. Test results

Commands run from `frontend/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass (no output) |
| `npm run lint` | pass (0 problems) |
| `npm run test` | **22 files, 214 tests, all passed** |
| `npm run build` | pass — 32 routes (unchanged) |

New suites (33 tests):

- `__tests__/progress-contract.test.ts` (14) — 0.5.0 contract and the exact four
  operations, method + path for every client call, tags, the completion request
  schema (`required: ["completed"]`, `additionalProperties: false`), the literal
  `{ completed: true }` body with no version/score/timestamp/owner, both `200` and
  `201` documented as success, query bounds mirrored, every required field of the
  nine schemas present in the TypeScript mirrors, the `CompletionState` enum and its
  text labels, no percentage arithmetic in the client or types, no demo/storage
  fallback, and confirmation that the only completion mutation in the whole contract
  is the student's own route.
- `__tests__/cohort-progress.test.tsx` (19) — server percentage and counts printed
  verbatim (66.7%, not 66.666…), module roll-up, `aria-valuenow`/`aria-valuetext`,
  text-labelled lesson states, `needs_review` explanation with
  `last_completed_version`, zero-published-lesson courses at 0/0 and 0.0% and never
  complete (no planned-module denominator), withdrawn history without eligibility,
  session change dropping the previous record, empty browser storage, the full
  completion flow (call arguments, confirmation, refetch, indicator, timestamp, no
  duplicate submit), idempotent `200` treated as success with the original timestamp,
  no un-complete control, missing enrollment context, a lesson outside the
  enrollment's course, a `422` that never looks like success, per-enrollment progress
  on the class list with its detail links, unreachable backend, the enrollment detail
  section plus class-preserving lesson/module links, the instructor report (average,
  counts, withdrawn row excluded, no mutation controls, pagination keeping the
  whole-class header, `404` as "not assigned"), and the manager report reusing the
  component against the admin endpoint.

Updated suite: `__tests__/cohort-contract.test.ts` now pins 0.5.0 and keeps counting
the 14 class paths / 18 class operations 02B owns (the four 02C progress routes are
asserted by `progress-contract.test.ts`). The 02B teaching/learning suite's
"no progress surface" copy was updated to "no grading, attendance or completion
override", and one lesson-page assertion was retargeted because the viewer now adds a
completion card. No assertion was weakened in substance.

Coverage is unit/SSR with the API client mocked or the network stubbed. No browser
end-to-end run against a live FastAPI + PostgreSQL stack was performed here; the
backend report covers its own live smoke.

## 10. Branch, commits and pull request

- The 02C frontend work is stacked on `deepseek/milestone-02c-progress` at `8142094`
  (PR #12, unmerged). Neither PR is merged.
- Arena pins this session to `arena/09c43e9e-cyberlab-academy`; pushes to other
  branches are refused by the environment. All commits are preserved there, and the
  branch is intended to be published as `arena/milestone-02c-frontend` with a stacked
  PR targeting `deepseek/milestone-02c-progress`, exactly as 02B was delivered
  (branch `arena/milestone-02b-frontend`, PR #11, base
  `deepseek/milestone-02b-cohorts`).
- No force-push, no history rewrite, no push to `main`, no change to GitHub
  credentials or Git configuration.

## 11. Known limitations

- One progress read per listed enrollment (up to 20 per page) on `/academics/learn`.
  The endpoint is per-enrollment by contract, so there is no batch read to use; the
  report deliberately does not cache the results between visits.
- No module-level drill-down for the class report: the API returns per-student
  totals, not per-student per-module breakdowns, so none are invented.
- `GET /admin/users` is still unpaginated (carried over from 02B), which affects the
  enrollment picker rather than progress.
- There is no grading, attendance, certificate or quiz capability in the API, so no
  score, rank or "passed" label appears anywhere near progress.
- Completion is self-attested study progress and is never presented as a competency
  score or assessment result.
- Verification is unit/SSR only; browser E2E against a live backend was out of scope
  for this milestone.

## 12. Running locally

```bash
# Backend (repository root) — requires PostgreSQL per backend/README
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm ci
CYBERLAB_BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

Sign in as a Student enrolled in an active class to see **Mark Lesson Complete**;
as that class's Instructor or as a Manager to see the class progress report.
