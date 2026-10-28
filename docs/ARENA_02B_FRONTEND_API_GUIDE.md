# CyberLab Academy — Milestone 02B frontend API guide (classes, rosters, lesson access)

Contract: [`shared-contracts/openapi.json`](../shared-contracts/openapi.json) — **API 0.4.0**.
This guide is the handoff for Arena AI. `openapi.json` is authoritative; this text only explains
intent, ordering and the rules a UI must not try to second-guess.

Base path `/api/v1`, cookie session (`credentials: "include"`), `Origin` required on every
mutation. All new responses carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## 1. Roles and the session-scoped active role

The server authorizes from `session.active_role`, not from "this user has that role somewhere".
A user with both Instructor and Student roles sees only one surface at a time; switching is
`POST /auth/active-role`.

| Active role | Sees |
|---|---|
| Student | published catalog, own enrollments (`/me/enrollments`), lesson body **only** with an active enrollment |
| Instructor | own assigned classes (`/instructor/cohorts`), their rosters, and published lesson bodies **only** for an active assigned class of that course |
| Manager / Administrator | all classes, assignments, enrollments, plus the 02A authoring preview |

Assigned-but-inactive roles grant nothing. Never render an Instructor screen because the user
*has* the role; render it when `/users/me` reports `active_role === "instructor"`.

## 2. Administration — classes (`/api/v1/admin/cohorts`)

Active Manager/Administrator. Reads need the role only; **mutations need `Origin` + a session
authenticated within 5 minutes** (Administrators also MFA within 5 minutes), otherwise `403`.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/admin/cohorts?course_id=&status=&limit=&offset=` | — | `PageCohorts` |
| POST | `/admin/cohorts` | `CohortCreate` | `201 CohortPublic` (always `draft`) |
| GET | `/admin/cohorts/{cohort_id}` | — | `CohortPublic` (any status) |
| PATCH | `/admin/cohorts/{cohort_id}` | `CohortPatch` (`name`, `starts_at`, `ends_at`) | `CohortPublic` |
| POST | `/admin/cohorts/{cohort_id}/activate` | — | `CohortPublic` → `active` |
| POST | `/admin/cohorts/{cohort_id}/complete` | — | `CohortPublic` → `completed` |
| POST | `/admin/cohorts/{cohort_id}/archive` | — | `CohortPublic` → `archived` |

`CohortCreate`: `course_id`, `code` (`^[A-Z0-9-]+$`, 2–40), `name` (1–160), optional
`starts_at`/`ends_at` (`ends_at` must be after `starts_at`, else `422`).

Lifecycle is **`draft → active → completed → archived`**, plus `draft → archived` directly.
Nothing moves backwards; there is no delete. Anything else is `409`.

### Activation gates (show these before the button works)
1. the course must be **published** — otherwise `409 "Publish the course before activating its classes"`;
2. at least one **eligible active instructor** must be assigned — otherwise `409`.

`course_id` is immutable and `status` is **not** patchable: send either and you get `422`
(unknown field). Use the transition endpoints only.

`CohortPublic` carries `active_instructor_count` and `active_enrollment_count` — server-computed,
never send them.

## 3. Administration — instructor assignments

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/admin/cohorts/{cohort_id}/instructors` | — | `CohortInstructorPublic[]`, active **and** past assignments |
| POST | `/admin/cohorts/{cohort_id}/instructors` | `{"instructor_user_id": "..."}` | `201 CohortInstructorPublic` |
| DELETE | `/admin/cohorts/{cohort_id}/instructors/{user_id}` | — | `204` |

- Assignment is soft: DELETE sets `removed_at` and the row stays in the history list with
  `active: false`. Re-assigning the same person clears `removed_at` and keeps the same `id`.
- `409` when the target holds no Instructor role, the account is inactive, the class is archived,
  or the person is already actively assigned. `404` when the user does not exist.
- Removing an assignment revokes that instructor's lesson and roster access on the very next
  request — refresh any cached teaching view.

## 4. Administration — enrollments

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/admin/cohorts/{cohort_id}/enrollments?status=&limit=&offset=` | — | `PageEnrollments` |
| POST | `/admin/cohorts/{cohort_id}/enrollments` | `{"student_user_id": "..."}` | `201 EnrollmentPublic` |
| PATCH | `/admin/enrollments/{enrollment_id}` | `{"status": "withdrawn" \| "active"}` | `EnrollmentPublic` |

- Enrolling requires an **active** class, an active account, a **verified email** and the Student
  role; otherwise `409`. There is no self-enrollment — an administrator adds the student.
- Duplicates (`409`, including concurrent double submits) — treat as "already enrolled" and
  refresh the roster instead of retrying.
- Withdrawal sets `ended_at`; reactivation clears it and requires the class to still be active
  (`409` otherwise). Sending the status the enrollment already has is `409`, not a no-op.

## 5. Instructor surface

Active Instructor role **and** a live assignment for that class. Unrelated classes answer `404`
(existence is not confirmed), not `403`.

| Method | Path | Result |
|---|---|---|
| GET | `/instructor/cohorts?limit=&offset=` | `PageCohorts` — only classes assigned to you |
| GET | `/instructor/cohorts/{cohort_id}` | `CohortPublic` |
| GET | `/instructor/cohorts/{cohort_id}/students?limit=&offset=` | `PageRoster` — active enrollments only |

`RosterEntry`: `user_id`, `full_name`, `email`, `email_verified`, `status`, `enrolled_at`.
No grades, progress or completion data exists in 02B.

## 6. Student surface

Active Student role. Own records only; another student's enrollment id answers `404`.

| Method | Path | Result |
|---|---|---|
| GET | `/me/enrollments?limit=&offset=` | `PageStudentEnrollments` (withdrawn rows included, labeled `withdrawn`) |
| GET | `/me/enrollments/{enrollment_id}/course` | `OwnEnrollmentCourse` = `{enrollment, cohort, course}` |

`StudentEnrollmentPublic` deliberately omits other learners' data and carries only
`cohort_code`, `cohort_name`, `cohort_status`, `course_code`, `course_title`, `status`, dates.

## 7. Lesson bodies — the real gate

`GET /api/v1/lessons/{lesson_id}` (`LessonDetail`) is now unlocked by relationships, not by role
alone:

| Active role | Granted when |
|---|---|
| Manager / Administrator | always (authoring preview, drafts included) |
| Student | account active + **email verified** + enrollment `active` in an **active** class whose course is this lesson's course + course, module and lesson all **published** |
| Instructor | live assignment (not removed) in an **active** class whose course is this lesson's course + lesson published |
| anything else | `403` |

Important consequences for the UI:

- A published lesson of another course is `403`, and so is a draft lesson inside your own course.
- Withdrawal, instructor removal, class completion/archival, suspension or role revocation take
  effect on the **next request**. Re-fetch; do not cache a previous success.
- `403` here is not an error state to hide — show "content unlocks with an active enrollment"
  for students, and "you are not currently assigned to this class" for instructors.
- The lesson list endpoints never include `body_markdown`.

## 8. Suggested page wiring

1. **/manage/classes** — `GET /admin/cohorts`; create/edit; transition buttons disabled with the
   activation reasons from §2 above.
2. **Class detail** — `GET /admin/cohorts/{id}`, `.../instructors`, `.../enrollments`; add/remove
   instructor, enroll student, withdraw/reactivate.
3. **/teach** — `GET /instructor/cohorts`; class detail + roster.
4. **/learn** — `GET /me/enrollments`; course view from `/me/enrollments/{id}/course`; lesson
   viewer calls `/lessons/{id}` and handles `403` as described.
5. Keep every previously demo-labeled panel (missions, progress, analytics) visibly **DEMO** until
   later phases replace it. 02B ships no progress or grading data.

## 9. Contract notes

- 16 new schemas, 14 new paths, **API 0.4.0**; every pre-existing path and schema is unchanged.
- IDs are plain strings (UUID values) as in 02A.
- Errors use FastAPI's `detail` shape; `422` for invalid input (including unknown fields),
  `409` for state conflicts, `403` for role/step-up/content gates, `404` where existence is
  concealed, `401` when unauthenticated.
- Read-only administrative endpoints work with a stale step-up; only mutations need the fresh
  reauthentication. Surface that distinction as a re-authenticate prompt rather than a logout.
