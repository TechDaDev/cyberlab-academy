# CyberLab Academy — Milestone 02C frontend API guide (lesson completion and progress)

Contract: [`shared-contracts/openapi.json`](../shared-contracts/openapi.json) — **API 0.5.0**.
Four new operations on top of the accepted 0.4.0 surface; nothing existing changed.
This guide explains intent and rules; the OpenAPI file is authoritative.

Base path `/api/v1`, cookie session (`credentials: "include"`), `Origin` required on the
completion mutation. All progress responses are `Cache-Control: no-store` /
`Referrer-Policy: no-referrer`.

> **What this is:** completion is a student's own statement that they reviewed a lesson. It is
> academic progress, **not** a score, grade, assessment result or certification. Never render it
> next to a fake percentage, quiz mark or "passed" badge. Keep existing demo panels labeled DEMO.

## 1. New operations

| Method | Path | Active role | Purpose |
|---|---|---|---|
| PUT | `/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion` | Student owner | Idempotent "mark complete" for the lesson's **current** version |
| GET | `/me/enrollments/{enrollment_id}/progress` | Student owner | Own course/module/lesson progress |
| GET | `/instructor/cohorts/{cohort_id}/progress?limit=&offset=` | Live-assigned Instructor | Class aggregate + paginated student rows |
| GET | `/admin/cohorts/{cohort_id}/progress?limit=&offset=` | Manager/Administrator | Same payload for any class |

## 2. Marking a lesson complete

Request body is exactly:

```json
{ "completed": true }
```

Anything else is rejected with `422`: `false`, `"yes"`, a score, a percentage, a timestamp, a
`lesson_version`, or another student's id. Unknown fields are refused, not ignored.

Response (`CompletionResponse`):

```json
{
  "enrollment_id": "…",
  "lesson_id": "…",
  "lesson_version": 2,
  "completed_at": "2026-10-29T17:04:11.918Z",
  "newly_recorded": true
}
```

| Status | Meaning |
|---|---|
| `201` | New evidence recorded for the lesson's current version |
| `200` | This version was already completed — **the original `completed_at` is returned unchanged** |
| `403` | Not an active enrollment / class, not your course, unpublished content, unverified email, or a non-Student active role |
| `404` | The enrollment or lesson is not yours / does not exist |
| `422` | Body validation failed |

Rules the UI must respect:

- Show the control only for an **active enrollment in an active class** on a **published** lesson.
  Withdrawn, completed, archived or other-course states mean no control, not a disabled retry loop.
- A repeat click is safe: `200` with the original timestamp, no duplicate history.
- There is **no un-complete** in 02C. Do not build a toggle; a checkbox that cannot be unticked
  is clearer than a fake undo.
- Only a Student can do this. Instructor, Manager and Administrator sessions get `403` — there is
  no "mark complete for a student" action anywhere in the API.

## 3. Student progress read

`GET /me/enrollments/{enrollment_id}/progress` → `EnrollmentProgress`:

```json
{
  "enrollment_id": "…", "course_id": "…", "cohort_id": "…",
  "cohort_status": "active", "enrollment_status": "active",
  "total_published_lessons": 3,
  "completed_current_lessons": 2,
  "needs_review_lessons": 1,
  "percent_complete": 66.7,
  "is_complete": false,
  "modules": [
    {"module_id": "…", "sequence": 1, "title": "…", "published_lesson_count": 2,
     "completed_current_lessons": 2, "needs_review_lessons": 0, "percent_complete": 100.0}
  ],
  "lessons": [
    {"lesson_id": "…", "sequence": 1, "title": "…", "lesson_version": 2,
     "status": "needs_review", "completed_at": null, "last_completed_version": 1}
  ]
}
```

Lesson `status`:

| Value | Meaning | UI |
|---|---|---|
| `not_started` | never completed | neutral |
| `current` | completed at the lesson's current `content_version` | completed, show `completed_at` |
| `needs_review` | completed an **older** version only | "Content updated — review again", keep `last_completed_version` visible |

- `percent_complete` is one decimal and always derived server-side. Never compute or override it
  in the client — recompute on every load and after every mutation.
- `is_complete` is false for a course with no published lessons: `0/0`, `0.0`, never 100%.
- The denominator is **published** lessons only. Unpublished, draft, archived or not-yet-authored
  CEH modules are not counted; a course may show far fewer lessons than its planned module count.
- Withdrawn students can still read this endpoint (their own history). They cannot create new
  completion.
- No lesson Markdown body appears here; use `/lessons/{id}` when access is granted.

## 4. Instructor class progress

`GET /instructor/cohorts/{cohort_id}/progress` → `ClassProgress`:

```json
{
  "cohort_id": "…", "course_id": "…", "cohort_status": "active",
  "total_published_lessons": 3,
  "total_active_enrollments": 2,
  "total_visible_enrollments": 3,
  "average_percent_complete": 50.0,
  "students": {
    "items": [
      {"enrollment_id": "…", "student_user_id": "…", "student_full_name": "…",
       "enrollment_status": "active", "completed_current_lessons": 2,
       "total_published_lessons": 3, "needs_review_lessons": 1, "percent_complete": 66.7}
    ],
    "limit": 30, "offset": 0, "total": 3
  }
}
```

- Requires a **live assignment** to that class. Another class returns `404`, even for an
  Instructor who teaches a different one — do not treat it as a permission error to retry.
- `average_percent_complete` is computed over **all active enrollments**, not over the current
  page. Label it "class average (self-reported progress)", never "grade".
- Withdrawn students appear in `students.items` with `enrollment_status: "withdrawn"` (history) but
  are excluded from `total_active_enrollments` and from the average.
- `total_visible_enrollments` = every row returned by paging, including withdrawn.
- A removed assignment revokes both the roster and this endpoint on the next request.
- Instructors can read progress only; they cannot change completion evidence.

## 5. Manager / Administrator class progress

`GET /admin/cohorts/{cohort_id}/progress` returns the identical `ClassProgress` payload for any
class. Requires the active Manager/Administrator role but **no** fresh step-up, so a reporting
screen keeps working after an idle period. Same pagination and aggregate semantics as §4.

## 6. Suggested page wiring

1. **Student — My classes**: `GET /me/enrollments`, then
   `GET /me/enrollments/{id}/progress` for the summary card (`x / y lessons`, percent,
   `needs_review` count).
2. **Student — lesson viewer**: call `/lessons/{id}`; if it succeeds, render content plus a
   "Mark lesson complete" button that calls the PUT and then re-reads progress. If the lesson
   shows `needs_review`, say the content changed rather than showing a stale check mark.
3. **Instructor — class progress**: table of `students.items` with per-student completion and a
   header showing the class average, `total_active_enrollments` and the published-lesson
   denominator. Paginate with `limit`/`offset`; the header numbers stay whole-class.
4. **Manager — class progress**: same component against the admin route.

## 7. Contract notes

- API **0.5.0**: 4 new paths and 9 new schemas (`CompletionRequest`, `CompletionResponse`,
  `CompletionState`, `EnrollmentProgress`, `ModuleProgressEntry`, `LessonProgressEntry`,
  `ClassProgress`, `ClassStudentProgress`, `PageClassStudentProgress`). No pre-existing path or
  schema changed, so 0.4.0 frontend code keeps working untouched.
- `limit` is 1–100 (default 30), `offset` ≥ 0; out-of-range values are `422`.
- Errors keep FastAPI's `detail` shape. `404` hides existence, `403` means the relationship or the
  state is not eligible, `422` means the request body or query is invalid.
