# CyberLab Academy — Milestone 03: Local Kali Challenge Engine Architecture

**Status:** Proposed architecture for review; no route, model, migration or contract in this document is implemented.  
**Prepared:** 2026-11-12.  
**Revised:** 2026-11-13 — enrollment-scoped student identity, award-bound adjustments with rejected
(non-clamped) bounds, 03A/03C/03D method gating, central-target-only profiles, cross-table invariants.  
**Revised again:** 2026-11-13 — cohort status corrected to the existing four-value lifecycle with an
assignment-window policy for scheduling; separate Instructor and Administrator authorization paths;
03B limited to the flag method actually implemented in 03A.  
**Baseline:** `TechDaDev/cyberlab-academy` `main` at `9afc37fc986e1b530f26c53efa35ecd05c80958c`.  
**Ownership:** ChatGPT architecture and acceptance; DeepSeek backend/API; Arena AI frontend/UX; Codex independent focused QA.

---

## 1. Decision record

CyberLab Academy will **not** simulate or stream Kali Linux inside the browser. Students use a real
Kali Linux installation on their own college laboratory computer (dual boot). CyberLab Academy
schedules and grades practical work; it does not provision, host or remotely control Kali.

Superseded assumptions:

- A browser-based Kali simulation is no longer a target deliverable. The existing
  `simulation-engine/` directory remains for deterministic, non-Kali educational simulation
  (quizzes, packet diagrams, decision exercises) and is not a challenge execution runtime.
- The platform does not allocate a Kali virtual machine per participant and does not require a
  permanent operating-system account on student machines.
- The college server is not a student shell host and must never execute student-supplied commands.

Retained platform baseline (no rewrite):

- FastAPI backend, PostgreSQL, Alembic migrations, Next.js frontend.
- Session-cookie authentication with active-role authorization.
- MFA for administrators and privileged reauthentication (step-up).
- Academic catalog (courses, modules, lessons), classes, instructor assignments, enrollments.
- Milestone 02C version-aware lesson completion, which remains a **separate** self-attested signal.
- `users` remains the single authoritative identity store. No second student account database.

## 2. System context

```text
+--------------------------+          HTTPS (same-origin proxy)          +----------------------+
| Student / Instructor /   |  <--------------------------------------->  | CyberLab Academy      |
| Manager browser          |                                            | Next.js + FastAPI     |
+--------------------------+                                            | on college Ubuntu     |
            |                                                          | server                |
            | local use only                                           | PostgreSQL            |
            v                                                          +----------+-----------+
+--------------------------+                                                      |
| Local Kali Linux         |                                                      | allowlisted
| (college computer,       |                                                      | verification only
|  dual boot)              |                                                      v
+--------------------------+                                            +----------------------+
            |                                                          | Isolated training    |
            | authorized lab-network traffic only                      | network + targets    |
            +--------------------------------------------------------> | (03D; separate host) |
                                                                       +----------------------+
```

Trust boundaries:

1. **Browser and local Kali are untrusted.** Students can read and modify local files, scripts and
   challenge packages. Local client evidence never proves completion by itself.
2. **College server is trusted** for identity, enrollment, scoring and audit.
3. **Training targets are untrusted-by-design** (deliberately vulnerable) and are isolated from
   production academic services.
4. **The verification runner is trusted** but constrained: declarative probes only, no arbitrary
   commands, no user-supplied destinations.

## 3. Domain model

The challenge domain composes with existing catalog/cohort tables rather than duplicating them.

- A **challenge** is a stable identity owned by a course and optionally a module.
- A **challenge version** is an immutable snapshot of authoring content, difficulty, maximum
  points, attempt limit, availability policy and verification configuration. Attempts always
  reference a version, so grading criteria cannot change under a student mid-assessment.
- A **challenge assignment** publishes one challenge version to one authorized class (cohort).
- A **challenge instance** is the per-enrollment working copy of an assignment. It carries the
  per-student flag derivation seed and attempt state.
- A **challenge attempt** is one immutable submission and its verification outcome.
- A **challenge award** is the single authoritative point award for an instance/version.
- A **score adjustment** is an append-only instructor/admin correction with reason and actor.

### 3.1 Naming refinements to the proposed tables

The proposed names are kept except for two justified additions:

| Proposed | Decision | Reason |
|---|---|---|
| `challenges` | kept, authoring metadata only | Stable identity separate from reproducible grading config |
| (new) `challenge_versions` | added | Required to freeze max points and verification criteria per attempt |
| `challenge_assignments` | kept | Binds a challenge version to one cohort |
| `challenge_instances` | kept | One per `(assignment, enrollment)`; per-student flag material |
| `challenge_attempts` | kept | Immutable submission + verdict history |
| `challenge_awards` | kept | Single positive award per instance; DB-enforced uniqueness |
| `challenge_score_adjustments` | kept | Append-only corrections; scores derived, never overwritten |
| (new) `challenge_evidence_submissions` | added | File metadata cannot live in an attempt row without losing scan/review state |
| (new) `challenge_target_profiles` | added | Explicit allowlist for **centrally hosted** training targets; local artifact exercises need no profile |

A version table is not optional. Without it, "instructors cannot silently alter the maximum score of
an assessment already attempted" is unenforceable.

## 4. Database architecture (additive, PostgreSQL)

Conventions follow existing models: `String(36)` UUID primary keys generated in Python, UTC
`DateTime(timezone=True)`, `String` enum-valued status columns with `CHECK` constraints,
`UniqueConstraint` names prefixed `uq_`, `CheckConstraint` names prefixed `ck_`.

### 4.1 `challenges`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `course_id` | FK `courses.id` NOT NULL, indexed | Ownership scope |
| `module_id` | FK `course_modules.id` NULL, indexed | Optional module association; must belong to `course_id` |
| `slug` | String(80) | Unique per course |
| `title` | String(200) | |
| `summary` | String(500) | Short student-facing description |
| `difficulty` | String(20) | `introductory`, `intermediate`, `advanced`, `expert` |
| `status` | String(20) | `draft`, `published`, `archived`; derived from version state |
| `current_version_id` | FK `challenge_versions.id` NULL | Set at first publish |
| `created_by` | FK `users.id` NULL | |
| `created_at`, `updated_at` | timestamptz | |

Constraints: `UNIQUE (course_id, slug)`; `CHECK status IN (...)`; `CHECK difficulty IN (...)`.
No cascade delete from `courses` or `module_lessons`: challenge history is assessment evidence.

### 4.2 `challenge_versions`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `challenge_id` | FK `challenges.id` NOT NULL, indexed | |
| `version_number` | Integer ≥ 1 | |
| `instructions_md` | Text | Authoring content |
| `max_points` | Integer 1..1000 | Frozen grading ceiling |
| `attempt_limit` | Integer 1..100 | Per instance |
| `verification_method` | String(24) | `flag`, `trusted_target`, `evidence` |
| `difficulty` | String(20) | Snapshot; may differ from challenge default |
| `flag_policy` | String(20) NULL | `per_instance` (default) or `static` |
| `flag_verifier_digest` | String(64) NULL | HMAC-SHA256 of normalized static flag; excluded from every response model |
| `flag_key_version` | Integer NULL | Key rotation support for static verifiers and derived flags |
| `target_profile_id` | FK `challenge_target_profiles.id` NULL | Required when method is `trusted_target` |
| `validation_rule` | String(40) NULL | Bounded enum selecting a predefined probe |
| `availability_starts_at`, `availability_ends_at` | timestamptz NULL | Default window |
| `time_limit_minutes` | Integer NULL | Optional per-instance limit |
| `points_policy` | String(20) | `all_or_nothing` (default) or `partial_credit` |
| `published_at` | timestamptz NULL | |
| `published_by` | FK `users.id` NULL | |
| `created_by` | FK `users.id` | |
| `created_at` | timestamptz | |

Constraints:

- `UNIQUE (challenge_id, version_number)`.
- `CHECK max_points > 0`, `CHECK attempt_limit > 0`.
- `CHECK availability_ends_at IS NULL OR availability_starts_at IS NULL OR availability_ends_at > availability_starts_at`.
- `CHECK (verification_method <> 'trusted_target' OR target_profile_id IS NOT NULL)`.
- `CHECK (verification_method <> 'flag' OR flag_policy IS NOT NULL)`.
- `CHECK (flag_policy <> 'static' OR flag_verifier_digest IS NOT NULL)`.

Immutability rule (enforced in the service layer and by tests, not by a trigger in 03A):

- A draft version may be edited freely.
- A version referenced by any published assignment or any attempt is **immutable**. Editing
  creates a new `challenge_versions` row with an incremented `version_number`.
- Publishing a new version does not retroactively change existing assignments; it becomes available
  for new assignments, or existing assignments move only through an explicit reassignment endpoint
  that is refused once attempts exist.
- Students always attempt the version pinned on their assignment/instance.

### 4.3 `challenge_assignments`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `challenge_id` | FK `challenges.id` NOT NULL | |
| `challenge_version_id` | FK `challenge_versions.id` NOT NULL | Pinned version |
| `cohort_id` | FK `course_cohorts.id` NOT NULL, indexed | Authorization scope |
| `assigned_by` | FK `users.id` | |
| `assigned_at` | timestamptz | |
| `availability_starts_at`, `availability_ends_at` | timestamptz NULL | Effective window; may only narrow the version window |
| `status` | String(20) | Assignment status: `scheduled`, `active`, `closed`, `withdrawn`. **Not** the cohort lifecycle. |
| `closed_at`, `closed_by` | | |

Constraints: `UNIQUE (challenge_version_id, cohort_id)`; `CHECK status IN (...)`; the assignment's
challenge course must equal the cohort course (validated server-side, covered by a test).

`challenge_assignments.status` is **not** the cohort lifecycle. `CourseCohort.status` keeps its
existing four values (`draft`, `active`, `completed`, `archived`) and is unchanged by Milestone 03. A
`scheduled` assignment inside an `active` cohort is normal; an assignment in `scheduled`,
`active` or any other state inside a `draft`, `completed` or `archived` cohort authorizes no student
work. See 6.2.1 for the effective policy.

### 4.4 `challenge_instances`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `assignment_id` | FK `challenge_assignments.id` NOT NULL, indexed | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL, indexed | **Ownership anchor** |
| `challenge_version_id` | FK `challenge_versions.id` NOT NULL | Copied from assignment; denormalized for readable constraints |
| `status` | String(20) | `issued`, `solved`, `expired`, `revoked` |
| `flag_seed` | String(64) NOT NULL | Server-generated random value; input to flag derivation |
| `flag_key_version` | Integer | Derived-flag key generation |
| `issued_at` | timestamptz | |
| `expires_at` | timestamptz NULL | Assignment window or time limit |
| `solved_at` | timestamptz NULL | Set once |
| `attempt_count` | Integer default 0 | Maintained transactionally with attempt insert |
| `created_at` | timestamptz | |

Constraints:

- `UNIQUE (assignment_id, enrollment_id)` — one working instance per student per assignment.
- `CHECK attempt_count >= 0`, `CHECK status IN (...)`.
- No cascade delete from `cohort_enrollments` or `challenge_assignments`; a withdrawn class row must
  not erase assessment evidence. Soft state changes instead of deletes.
- `flag_seed` and any future target credential are never serialized to a student response.
- The instance's `enrollment_id` must equal the enrollment of the assignment's cohort (C5) and the
  `challenge_version_id` must equal the assignment's pinned version (C6). Both are resolved
  server-side at issuance; the student supplies only `enrollment_id` and `assignment_id` in the path,
  and each is validated against the session user and the assignment's cohort.

### 4.5 `challenge_attempts`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `instance_id` | FK `challenge_instances.id` NOT NULL, indexed | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL, indexed | Denormalized ownership for constraints and scoping |
| `attempt_number` | Integer ≥ 1 | |
| `submitted_at` | timestamptz | Server time; never client-supplied |
| `submitted_by` | FK `users.id` NOT NULL | Session user; must equal enrollment student |
| `submission_kind` | String(20) | `flag`, `trusted_target`, `evidence` |
| `submitted_value_digest` | String(64) NULL | HMAC of normalized flag; raw flag never persisted |
| `evidence_submission_id` | FK `challenge_evidence_submissions.id` NULL | |
| `verdict` | String(20) | `accepted`, `rejected`, `pending_review`, `error` |
| `verifier_reason_code` | String(40) NULL | Bounded enum, safe for students |
| `verifier_detail` | String(500) NULL | Instructor/admin-only detail; never contains secrets |
| `client_request_id` | String(64) NULL | Idempotency key |
| `duration_ms` | Integer NULL | Verification latency metric |

Constraints:

- `UNIQUE (instance_id, attempt_number)`.
- Partial unique index `uq_challenge_attempts_one_accepted ON (instance_id) WHERE verdict = 'accepted'` —
  at most one accepted attempt per instance.
- Partial unique index on `(instance_id, client_request_id)` where `client_request_id IS NOT NULL` —
  retry-safe submission.
- `CHECK attempt_number > 0`; `CHECK verdict IN (...)`.
- `03A` accepts only `submission_kind = 'flag'`. The `trusted_target` and `evidence` kinds exist for
  later milestones and are refused with `501` while their methods are disabled.
- `attempts` and `challenge_score_adjustments` recompute nothing: the effective score is always
  `sum(awards.points) + sum(adjustments.delta_points)` for the enrollment and version.
- A `pending_review` verdict may exist only for the evidence method, which is disabled in 03A.

### 4.6 `challenge_awards`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `instance_id` | FK `challenge_instances.id` NOT NULL | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL, indexed | |
| `challenge_version_id` | FK `challenge_versions.id` NOT NULL | |
| `attempt_id` | FK `challenge_attempts.id` NOT NULL | Winning attempt |
| `points` | Integer ≥ 0 | `CHECK points <= max_points_snapshot` |
| `max_points_snapshot` | Integer > 0 | Frozen at award time |
| `awarded_at` | timestamptz | Server time |
| `awarded_by` | String(24) | `automatic_verifier` or `instructor_review` |

Constraints:

- `UNIQUE (instance_id)` — the concurrency guard: concurrent verifications cannot double-award.
- `UNIQUE (enrollment_id, challenge_version_id)` — a reissued instance for the same version cannot
  award points twice (replay protection).
- `CHECK points >= 0` and `CHECK points <= max_points_snapshot`.
- Awards are immutable. No update or delete endpoint exists.
- `points_policy` is `all_or_nothing` in 03A, so a winning attempt awards the version's `max_points`
  exactly; a zero-point award is not produced by verification and would require a later, explicitly
  documented policy change. Every adjustment therefore corrects a positive award.
- The award service copies `max_points_snapshot` from the instance's pinned version inside the
  verification transaction, so a later version edit cannot change a historical ceiling.

### 4.7 `challenge_score_adjustments`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL, indexed | Must equal the referenced award's enrollment |
| `challenge_version_id` | FK `challenge_versions.id` NOT NULL, indexed | Must equal the referenced award's version |
| `award_id` | FK `challenge_awards.id` NOT NULL | **An adjustment always corrects one existing award in 03A** |
| `delta_points` | Integer ≠ 0 | Append-only delta |
| `points_before` | Integer ≥ 0 | Effective score before the adjustment |
| `points_after` | Integer ≥ 0 | Effective score after the adjustment; must equal `points_before + delta_points` |
| `reason` | String(500) NOT NULL | Required, non-empty, non-whitespace |
| `actor_id` | FK `users.id` NOT NULL | |
| `actor_role` | String(20) NOT NULL | Active role used for the action |
| `created_at` | timestamptz | |

Constraints: `CHECK delta_points <> 0`; `CHECK points_after = points_before + delta_points`;
`CHECK points_before >= 0`; `CHECK points_after >= 0`. Every adjustment also writes an
`audit_events` row in the same transaction.

**03A adjustment policy — award required.** An adjustment modifies one existing award and inherits
its `enrollment_id` and `challenge_version_id`; the application rejects a mismatch rather than
accepting the values from the request. Standalone bonuses, penalties with no underlying award, and
broader partial-credit policies are **deferred to Milestone 03E**. A challenge that cannot award
points through verification has no adjustment path in 03A by design.

### 4.8 `challenge_evidence_submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `instance_id` | FK `challenge_instances.id` NOT NULL, indexed | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL | |
| `storage_key` | String(200) UNIQUE | Random opaque key; never a user-supplied path |
| `original_filename` | String(255) | Sanitized for display only |
| `declared_mime` | String(120) | Advisory |
| `detected_mime` | String(120) NULL | Server sniffed |
| `size_bytes` | BigInteger | `CHECK size_bytes > 0` |
| `sha256` | String(64) | Integrity, duplicate detection |
| `scan_status` | String(20) | `pending`, `clean`, `infected`, `failed`, `skipped` |
| `review_status` | String(20) | `not_required`, `pending`, `accepted`, `rejected` |
| `reviewed_by`, `reviewed_at`, `review_note` | | Instructor decision |
| `created_at` | timestamptz | |

`BigInteger` requires a new import; no existing table uses it. Acceptable additive change.

### 4.9 `challenge_target_profiles`

This table governs **centrally hosted training targets only** (Mode B, Milestone 03D). Local
artifact-based exercises (Mode A) ship a downloadable package and have no addressable network
target, so a challenge version using `flag` or `evidence` verification leaves `target_profile_id`
`NULL` and requires no profile row at all.

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `label` | String(120) | Human name |
| `mode` | String(20) | `central_target`; the only supported mode |
| `host` | String(255) NULL | Internal DNS name or literal address; administrator-managed, never client-supplied. Required before approval. |
| `port` | Integer NULL | 1..65535. Required before approval. |
| `probe_kind` | String(40) NULL | Predefined verifier, e.g. `http_expected_marker`, `tcp_banner`. Required before approval. |
| `expected_value_digest` | String(64) NULL | HMAC of expected marker. Required for marker-based probes. |
| `allowed_paths` | String(500) NULL | Newline-delimited fixed paths for HTTP probes. Optional; ignored by non-HTTP probes. |
| `isolation_zone` | String(40) NULL | Lab segment identifier. Required before approval. |
| `status` | String(20) | `draft`, `approved`, `retired` |
| `created_by` | FK `users.id` | |
| `approved_by` | FK `users.id` NULL | Administrator who approved; required when `status = 'approved'` |
| `approved_at` | timestamptz NULL | |
| `created_at` | timestamptz | |

Constraints:

- `CHECK mode = 'central_target'`.
- `CHECK status IN ('draft', 'approved', 'retired')`.
- `CHECK port IS NULL OR (port >= 1 AND port <= 65535)`.
- `CHECK (status <> 'approved' OR (host IS NOT NULL AND port IS NOT NULL
  AND probe_kind IS NOT NULL AND isolation_zone IS NOT NULL AND approved_by IS NOT NULL))`.

A `draft` profile may be created with only `label` and `mode`. Host, port, probe kind and isolation
zone become mandatory at approval, which is transactional and audited. Only administrators create,
approve or retire profiles; instructors select an already-approved profile when authoring a
`trusted_target` version and can never type a destination. This table is the allowlist that makes
SSRF prevention structural. Profiles are usable only when Milestone 03D enables trusted-target
verification; a `draft` profile in 03A has no effect.

### 4.10 Derived score, never stored as a total

For one enrollment:

```text
effective_points(enrollment, challenge_version)
  = coalesce(sum(awards.points), 0) + coalesce(sum(adjustments.delta_points), 0)

valid  <=>  0 <= effective_points <= max_points_snapshot
```

**Invariant, not a clamp.** The application rejects any adjustment that would produce
`effective_points < 0` or `effective_points > max_points_snapshot`. It never silently clamps a total,
and it never stores a corrected value different from what the operator requested. The check runs
inside the same transaction that inserts the adjustment, after locking the award row, so concurrent
adjustments cannot each pass a stale bound check.

- `422 Unprocessable Entity` — the submitted `delta_points` is zero, or the requested
  `points_before` is outside `[0, max_points_snapshot]`, or the reason is empty.
- `409 Conflict` — the requested `points_before` is stale, or applying the delta would exceed
  `[0, max_points_snapshot]` given the current persisted state. The response identifies the
  bound that was violated (`below_minimum` / `above_maximum`) and the current effective score.

Awards remain immutable. Awards themselves are always within `[0, max_points_snapshot]` because the
award service copies `max_points_snapshot` from the version at award time. Adjustments are
append-only and are the only permitted score-change mechanism. Challenge totals and course totals are
computed at read time. No client-supplied total, no persisted aggregate, and no mixing with the Milestone 02C
lesson-progress percentage.

### 4.11 Audit history

Reuse the existing `audit_events` table. Additive action names, each written in the same transaction
as the state change:

- `challenge.created`, `challenge.version_created`, `challenge.version_published`,
  `challenge.archived`
- `challenge.assignment_created`, `challenge.assignment_withdrawn`
- `challenge.instance_issued`, `challenge.instance_revoked`
- `challenge.attempt_submitted`, `challenge.attempt_accepted`, `challenge.attempt_rejected`
- `challenge.award_created`
- `challenge.score_adjusted` (must include `before`, `after`, `reason`)
- `challenge.evidence_uploaded`, `challenge.evidence_reviewed` (03C)
- `challenge.target_profile_approved`, `challenge.target_profile_retired` (03D)
- `challenge.method_enabled`, `challenge.method_disabled` — configuration change with actor and
  affected method

Never place flags, digests, target credentials or file contents in `audit_events.detail`
(`String(500)`).

### 4.12 Cross-table consistency invariants

These relationships span tables, so a single foreign key cannot express them. Each is enforced by a
constraint where PostgreSQL allows it and by a transactional application check otherwise. Every
invariant gets a direct test; a violation must fail closed before commit, never produce a partially
valid assessment graph.

| # | Invariant | Enforcement |
|---|---|---|
| C1 | `challenges.module_id` (when set) belongs to `challenges.course_id` | Application check on create/update inside the transaction; composite FK `(module_id, course_id)` → `course_modules(id, course_id)` where the catalog exposes a matching unique key, otherwise the check plus a test |
| C2 | `challenge_versions.challenge_id` references the challenge it claims | Plain FK `challenge_versions.challenge_id` → `challenges.id`; the version is always created through the challenge's route, and the service rejects a mismatched `challenge_id` in a body |
| C3 | `challenge_assignments.challenge_version_id` belongs to `challenge_assignments.challenge_id` | Application check in the assignment transaction; option `CHECK`-backed composite FK `(challenge_version_id, challenge_id)` → `challenge_versions(id, challenge_id)` on a unique index |
| C4 | `challenge_assignments.cohort_id` is a cohort of the challenge's course | Application check; `CourseCohort.course_id` compared to `Challenge.course_id`. Composite FK `(cohort_id, course_id)` → `course_cohorts(id, course_id)` where available |
| C5 | `challenge_instances.enrollment_id` belongs to `challenge_instances.assignment_id`'s cohort | Application check on issuance; composite FK `(assignment_id, enrollment_id)` → `challenge_assignments(id, cohort_id)` is not directly expressible, so the service resolves the enrollment's `cohort_id` and the assignment's `cohort_id` and refuses a mismatch (`404`) |
| C6 | `challenge_instances.challenge_version_id` equals the assignment's pinned version | Application check on issuance; a defensive `CHECK` is not expressible across tables, so the test asserts equality and any later reassignment is refused when attempts exist |
| C7 | `challenge_attempts.enrollment_id` and `challenge_instances.enrollment_id` are the same enrollment | Application check on submission; the attempt copies the instance's enrollment, never a request value. Option: composite FK `(instance_id, enrollment_id)` → `challenge_instances(id, enrollment_id)` on a unique index |
| C8 | `challenge_awards.enrollment_id` and `challenge_version_id` match the winning instance and attempt | Application check inside the award transaction; `UNIQUE (instance_id)` already binds one award per instance |
| C9 | `challenge_score_adjustments.enrollment_id`, `challenge_version_id` and `award_id` all describe the same award | Application check derived from the locked award; the request cannot supply these values |
| C10 | `challenge_evidence_submissions.enrollment_id` matches its instance | Application check on upload authorization |
| C11 | A challenge version is immutable once assigned or attempted | Application check on every patch; `409` on violation |

Implementation guidance:

- Prefer composite foreign keys with a unique index when the referenced table can expose the extra
  key without changing existing catalog tables. The catalog tables are owned by earlier milestones;
  if adding such a unique index is not additive-safe, use the transactional check and document it.
- Never accept `enrollment_id`, `challenge_id`, `challenge_version_id`, `assignment_id` or
  `instance_id` from a student request body as authorization evidence.
- Perform cross-table reads and the write in one transaction at a consistent isolation level so a
  concurrent catalog or enrollment edit cannot slip between the check and the insert.
- A failed consistency check returns `404` for student-facing concealment, or `409`/`422` for
  authenticated operational errors where the actor legitimately knows the object exists.
- Cover each invariant with a negative test that asserts no dependent row is written.

### 4.13 Migration strategy

- One additive Alembic revision after the 02C revision, for example `0006_challenge_engine`.
- `upgrade()` creates the new tables in dependency order: `challenge_target_profiles`, `challenges`,
  `challenge_versions`, `challenge_assignments`, `challenge_instances`,
  `challenge_evidence_submissions`, `challenge_attempts`, `challenge_awards`,
  `challenge_score_adjustments`; then the `challenges.current_version_id` FK.
- `downgrade()` drops in reverse order and must run cleanly on a database containing 02A–02C data.
- No existing table is altered. No column is removed or renamed.
- SQLite local tests and a PostgreSQL upgrade/downgrade/upgrade cycle are both required.

## 5. Verification methods

### 5.1 Method availability per milestone

Milestone 03A delivers **one operational verification method: flag verification**. The data model
reserves `trusted_target` and `evidence` so later milestones do not need a destructive migration, but
an unfinished method must never produce a grade.

Rules for 03A:

- `verification_method` is limited to `flag` for any challenge version that can be published or
  assigned. A version whose method is not enabled is rejected at publish (`422`) and at assignment
  (`422`), not silently degraded to another method.
- Method enablement is server configuration (`CHALLENGE_ENABLED_METHODS`), defaulting to `flag`.
  Enabling a method is a deliberate release action tied to the milestone that implements it: `evidence`
  in 03C, `trusted_target` in 03D.
- If a method is disabled, its routes return `501 Not Implemented` — never `200` with an invented
  verdict, never a stored award, never a "pending" grade that a student could mistake for success.
- `challenge_evidence_submissions` and `challenge_target_profiles` may exist and be exercised by
  tests in 03A, but they are inert without the corresponding enabled method.
- Test fixtures for 03A use the `flag` method with predetermined fixture instances whose expected
  values are known to the test only; no additional method is invented for testing. The shipped
  default configuration exposes flag verification alone, and fixture data is never seeded into a
  production-like environment or reachable from a student route.
- The implementation report must state exactly which methods are operational and which are disabled.

Milestone boundaries:

| Milestone | Verification capability | Student experience |
|---|---|---|
| 03A | Flag verification operational; other methods disabled | Synthetic fixtures only; no real Kali package |
| 03C | Local Kali challenge packages, repeatable per-student artifacts, evidence workflow | Complete local-lab exercise |
| 03D | Operational isolated central targets with trusted target verification | Mode B exercise against a live lab target |

Do not advertise evidence review or target verification as available before 03C/03D respectively.

### 5.2 Flag verification

- Prefer **per-instance derived flags**: expected value is computed as
  `FLAG{base32(HMAC-SHA256(K_flag[v], "instance:" || flag_seed || ":" || challenge_version_id))[:20]}`.
  The flag is never stored. `flag_seed` is a server-generated random value on
  `challenge_instances`, and `v` is the instance's `flag_key_version`. Rotating to a new key version
  must not invalidate already-issued instances.
- Static flags are permitted only for a challenge that cannot be randomized; they are stored as an
  HMAC digest under a domain-separated server key (`K_static[v]`), never as plain text, and are
  excluded from every serializer and OpenAPI response model.
- Submitted flags are normalized consistently (trim, Unicode NFKC, preserve case), digested with
  HMAC-SHA256, and compared with `hmac.compare_digest`.
- Responses do not reveal length, prefix, partial-match or "close" information. All rejections use
  the same body and status.
- Correct submission is idempotent: a repeat submission returns the existing award and the original
  `awarded_at`; no second award, no additional points, no duplicate audit event.
- Chaining and sharing are throttled by per-instance attempt limits, per-user rate limits and
  per-instance flags. A shared flag from another student's instance fails.

#### 5.2.1 How 03A and 03C divide flag delivery

**Milestone 03A delivers the verification mechanism, not a usable Kali exercise.** In 03A:

- The server can issue an instance, derive the expected flag from `flag_seed`, and verify a submitted
  value with the award/idempotency guarantees above.
- Student responses never include the expected flag, the `flag_seed`, the key generation, the
  verifier digest, any prefix, or any hint that would let a student derive the flag offline.
- Automated tests and seeded fixtures use **synthetic fixture flags**: predetermined values in test
  data whose expected value is known to the test, not to a client. Fixtures must not be reachable
  from a normal student-facing route and must not be seeded into a production-like environment.
- A student cannot complete a real exercise in 03A because no artifact embeds a discoverable flag yet.
  The architecture must not claim otherwise.

**Milestone 03C delivers the discoverable flag** as part of a per-student downloadable package. The
package-generation flow keeps the secret server-side:

1. The server loads the instance and the challenge version, and derives the expected flag
   `F = derive(K_flag[v], flag_seed, challenge_version_id)` inside the server process.
2. The package builder writes `F` into the exercise artifact in the place the scenario requires —
   for example a file the student must enumerate, a service banner, a database row, a log entry, or
   a value the student computes from data provided in the artifact.
3. The builder writes only `F` and the scenario material. It never writes `K_flag`, `flag_seed`,
   `flag_key_version`, the HMAC of a static flag, another student's instance data, or the derivation
   inputs. A student who fully reverse-engineers the package learns `F` for **their own** instance and
   cannot compute anyone else's.
4. The package is bound to `(assignment_id, enrollment_id)` and downloadable only through an
   authorized, rate-limited, short-lived route.
5. Verification compares the submitted value against a freshly derived `F`, so the server stores no
   plaintext flag at any point.
6. If the derived flag must change, a new package is generated for the same instance from the same
   seed — deterministic and repeatable — rather than mutating the instance.

Packages are per-student artifacts, not static course downloads. Two students in the same class
receive different flags, and a student enrolled in two classes receives two independent instances and
two different packages. The 03C package must also state that the flag is only meaningful inside the
authorized exercise.

**Honest limitation of flag-in-package designs.** The flag must be embedded where the exercise is meant
to reveal it (an enumeration result, a service response, a record, a computed value). Any artifact
that ships the flag as a readable constant can be grepped without performing the exercise. That is an
accepted tradeoff for **low-stakes local-lab** challenges, where per-instance derivation prevents
sharing and the student is only cheating themselves. It is **not** acceptable evidence for an official
or high-stakes grade: those must use trusted target verification (03D) or instructor-reviewed evidence.
The 03C package specification must state, per challenge, which of these applies, and the challenge
authoring guide must not describe a greppable artifact as a secure assessment.

### 5.3 Trusted target verification

Applies to **centrally hosted training targets only** (Mode B). A local artifact exercise has no
addressable target and never uses this method. The method is disabled in 03A and becomes operational
in 03D; see 5.1.

- The verifier accepts only `target_profile_id` and a `validation_rule` from the challenge version.
  It never accepts a host, URL, port, path, command or query from a student request.
- Resolution order: profile row → `approved` status → assigned isolation zone → profile host/port →
  fixed probe implementation selected by `probe_kind`. A `draft` or `retired` profile fails
  verification instead of falling back to any other destination.
- Probes are in-process, declarative and bounded: fixed connect/read timeouts (≤ 5 s), response size
  cap (≤ 64 KiB), no redirect following, no TLS verification bypass, no arbitrary headers.
- A dedicated verification runner on the laboratory segment performs the egress. The application
  server does not hold broad lab-network routing.
- Denied destinations for any probe implementation: loopback, link-local (including
  `169.254.169.254`), multicast, unspecified, and any address outside the approved profile.
- The student cannot supply the verifier result; only the runner's signed outcome is recorded.
- Repeated verification of the same instance is idempotent and does not re-award.
- If the method is disabled, the attempt route returns `501` and creates no award. There is no
  "optimistic pass" and no pending grade.

### 5.4 Evidence submission

- Upload is a two-step flow: create metadata/authorization, then stream the bytes to a dedicated
  storage path. The application never executes, interprets or serves the file inline.
- Enforced: format allowlist (PDF, plain text, Markdown, PNG/JPEG; PCAP only when explicitly
  enabled), size cap, filename sanitization, random object key, SHA-256, MIME sniffing, and an
  anti-malware scan before an instructor can open it.
- Files live outside the application document root, on a private volume or dedicated bucket, with
  per-enrollment authorization and short-lived signed download links.
- Automated validation may only *flag* plausibility. It never awards full points automatically.
  Instructor acceptance creates the award or adjustment with reason and audit history.
- Disabled in 03A; operational in 03C. If disabled, the evidence routes return `501` and no
  `challenge_evidence_submissions` row can be created.

## 6. API architecture (Milestone 03A proposal, base `/api/v1`)

All routes use the existing cookie session, active-role authorization, `require_origin` on every
mutation, and the existing security headers. No GET has side effects. Nothing here may be added to
`shared-contracts/openapi.json` until 03A is approved and implemented.

### 6.1 Instructor and administrator

**Two independent authorization paths reach the `/instructor/*` routes.** They are never mixed:

| Path | Who | Requirement |
|---|---|---|
| Teaching path | active Instructor role | A current `cohort_instructors` row (`removed_at IS NULL`) covering the challenge's course or the requested cohort. Scope is limited to those classes and their courses. |
| Administrative path | active Administrator role | An explicitly authorized administrative capability. **No Instructor role and no teaching assignment is required or implied.** Scope is all courses and classes, still subject to active-role authorization, administrator MFA and privileged step-up where the operation changes grades. |

Consequences, applied consistently:

- An administrator does **not** need to be added to a class to author, publish, assign, or review.
- An administrator's authority comes from the Administrator role, not from acquiring an Instructor
  assignment. The system must not auto-create `cohort_instructors` rows for administrators.
- An instructor with a live assignment is never given administrator breadth; their scope stays
  class-bound.
- A Manager cannot use `/instructor/*` for writes under any circumstance, and cannot self-assign as
  instructor. Manager access is read-only and separate (`/admin/cohorts/.../challenge-results`).
- A Student cannot reach any `/instructor/*` or `/admin/*` route, even with a second assigned role,
  unless that role is the session's active role.
- An administrator who also holds an Instructor role is evaluated on the **active** role of the
  current session; switching to Instructor narrows scope to their own classes.

| Method | Path | Active role | Authorization and behavior |
|---|---|---|---|
| POST | `/instructor/challenges` | Instructor (live course assignment) **or** Administrator (no assignment needed) | Creates draft challenge + draft version 1. `201`. |
| GET | `/instructor/challenges` | Instructor (live assignment) **or** Administrator | Scope: Instructor = courses with a live assignment; Administrator = all courses. Filters `course_id`, `module_id`, `status`; paginated. `200`. |
| GET | `/instructor/challenges/{challenge_id}` | Instructor (live assignment) **or** Administrator | Instructor: `404` when not in scope. Administrator: `200`. |
| PATCH | `/instructor/challenges/{challenge_id}` | Instructor (live assignment) **or** Administrator | Draft-only metadata. `200`; `409` if a published version exists and the field is immutable. |
| POST | `/instructor/challenges/{challenge_id}/versions` | Instructor (live assignment) **or** Administrator | Creates new draft version from current. `201`; `409` if the challenge has zero published versions and v1 is still draft. |
| PATCH | `/instructor/challenge-versions/{version_id}` | Instructor (live assignment) **or** Administrator | Draft version only. Verification config, max points, attempt limit, window. `200`; `409` once published or attempted. |
| POST | `/instructor/challenge-versions/{version_id}/publish` | Instructor (live assignment) **or** Administrator | Validates completeness; sets `published_at`; updates challenge status/current version. `200`; `422` when invalid; `409` when already published. |
| POST | `/instructor/challenges/{challenge_id}/assignments` | Instructor (live cohort assignment) **or** Administrator | Body: `cohort_id`, `challenge_version_id`, optional window and status. `201`; `409` duplicate; `422` course/version mismatch. |
| GET | `/instructor/challenges/{challenge_id}/assignments` | Instructor (live assignment) **or** Administrator | Scoped list. `200`. |
| POST | `/instructor/challenge-assignments/{assignment_id}/withdraw` | Instructor (live cohort assignment) **or** Administrator | Soft close; refuses if a submission is in flight. `200`; Instructor out of scope is `404`. |
| GET | `/instructor/cohorts/{cohort_id}/challenges` | Instructor (live cohort assignment) **or** Administrator | Class challenge list. One row per **assignment** in that cohort with `assignment_id`, challenge title, version, completion count and mean score. Instructor out of scope: `404`. `200`. |
| GET | `/instructor/challenge-assignments/{assignment_id}/results` | Instructor (live cohort assignment) **or** Administrator | Paginated per-enrollment rows for that one assignment: attempts used, best verdict, awarded points, adjustment total. Instructor out of scope: `404`. Assignment-scoped because one challenge may be assigned to several classes or versions. |
| GET | `/instructor/challenge-assignments/{assignment_id}/attempts/{attempt_id}` | Instructor (live cohort assignment) **or** Administrator | Verdict detail, redacted submission digest, evidence metadata. `200`; `404` when the attempt belongs to another assignment or class for an Instructor. |
| POST | `/instructor/challenge-awards/{award_id}/adjustments` | Instructor (live cohort assignment) **or** Administrator | Requires an existing award. Body: `delta_points`, `points_before`, `reason`. **Recent privileged reauthentication is required for both roles.** Records before/after and an audit row. `201`; `404` award outside an Instructor's scope; `409` stale `points_before` or the resulting score would leave `[0, max_points_snapshot]`; `422` zero delta, empty reason, or invalid `points_before`. |
| GET | `/admin/cohorts/{cohort_id}/challenge-results` | Manager **or** Administrator | Read-only class challenge statistics by assignment, same shape as instructor results. Managers cannot adjust scores. `200`. |

Managers may inspect class-level challenge progress and scoring statistics. Managers may not author,
assign, verify or adjust challenge results in 03A; a later milestone may widen this after review.
Score adjustment is out of scope for managers in every 03 milestone unless an explicit later decision
changes it. Managers are never granted Instructor write permissions by any route, and Manager is not a
substitute for Administrator.

**Target-profile routes are 03D routes.** `POST /admin/challenge-target-profiles`,
`POST /admin/challenge-target-profiles/{id}/approve` and
`POST /admin/challenge-target-profiles/{id}/retire` are specified here so the schema is complete, but
they return `501` in 03A. Approving a profile must never be presented as enabling target verification
before Milestone 03D ships the runner and the network isolation. Only an administrator may create,
approve or retire a profile; no instructor or student route accepts a host, address, URL or port.

#### Deferred routes (documented, `501` until their milestone)

| Milestone | Method | Path | Active role | Purpose |
|---|---|---|---|---|
| 03D | POST | `/admin/challenge-target-profiles` | Administrator | Create a central-target profile in `draft`. |
| 03D | POST | `/admin/challenge-target-profiles/{id}/approve` | Administrator | MFA/step-up; makes the profile usable by verification. |
| 03D | POST | `/admin/challenge-target-profiles/{id}/retire` | Administrator | Stops future verification use; historical attempts keep their outcome. |

No 03D route is mounted-and-enabled before 03D. Returning `501` is mandatory; returning `200` from an
unimplemented verifier would be a false grade.

### 6.2 Student

A student route identifies work by **enrollment plus assignment**, never by a bare `challenge_id`.
The same challenge may be assigned to several classes, and a student may be enrolled in more than one
of them. Only `(enrollment_id, assignment_id)` identifies one attemptable unit.

| Method | Path | Active role | Authorization and behavior |
|---|---|---|---|
| GET | `/me/enrollments/{enrollment_id}/challenges` | Student owner | Assignments visible for exactly that enrollment: `active` enrollment in an `active` cohort, published version. Returns `assignment_id`, `challenge_id`, per-assignment status, availability window and points. `404` when the enrollment is not the caller's. Scheduled assignments may appear with `attemptable: false`; see 6.2.1. |
| GET | `/me/challenge-assignments/{assignment_id}` | Student owner | Instructions, authorized target description, resources, attempt allowance, earned points, and the owning `enrollment_id`. **No flag, digest, verifier detail or target credentials.** `200`; `404` when the assignment does not belong to an active enrollment of the caller. |
| POST | `/me/enrollments/{enrollment_id}/challenge-assignments/{assignment_id}/instance` | Student owner | Idempotently issues or returns the instance for exactly this enrollment and assignment. `201` first issue, `200` existing; `403` inactive enrollment; `404` when the assignment is not in this enrollment's cohort; `409` cohort not `active`, availability window not open or already closed, or assignment withdrawn/closed; `410` instance revoked. No instance is issued for a merely scheduled assignment. |
| GET | `/me/enrollments/{enrollment_id}/challenge-assignments/{assignment_id}/instance` | Student owner | Own instance state, attempts used/remaining, deadline. `200`; `404`. |
| POST | `/me/challenge-instances/{instance_id}/attempts` | Student owner | Body: `kind` + `flag` or `evidence_submission_id`. Instance ownership is resolved from the instance row, not from the request. Requires `Idempotency-Key`. `201` accepted, `200` replay, `202` pending review (03C), `409` already solved or limit reached, `410` expired/revoked, `422` malformed, `429` throttled, `501` method not enabled. |
| GET | `/me/challenge-instances/{instance_id}/attempts` | Student owner | Own attempt history, newest first, paginated. `200`; `404`. |
| POST | `/me/challenge-instances/{instance_id}/evidence` | Student owner | Metadata + upload authorization for the evidence method (03C). `201`; `413` too large; `415` unsupported format; `429`; `501` method not enabled; `503` scanner unavailable. |
| GET | `/me/enrollments/{enrollment_id}/challenge-scores` | Student owner | Per-challenge awards, adjustments, derived totals, attempt counts for that enrollment only. `200`; `404` for another enrollment. |
| GET | `/me/enrollments/{enrollment_id}/challenge-resources/{resource_id}` | Student owner | Short-lived signed download for a resource assigned to that enrollment (03C). `200`; `404` when not assigned or wrong enrollment; `429` abusive download rate. |

**Enrollment and assignment resolution rules.** The server derives the caller from the session, then:

1. Loads the enrollment and requires `student_user_id == session user`; otherwise `404`. Never
   returns `403` for someone else's enrollment.
2. Loads the assignment and requires `assignment.cohort_id == enrollment.cohort_id`. An assignment in
   another class, even for the same course and same challenge, is `404`.
3. Requires the enrollment to be `active` and the cohort to be `active`. `CourseCohort.status` has
   exactly four values — `draft`, `active`, `completed`, `archived` — and only `active` authorizes
   challenge work. There is no `scheduled` cohort status; scheduling is a property of the
   assignment's availability window, not of the cohort.
4. Never "picks the first matching enrollment". A given `(enrollment_id, assignment_id)` pair resolves
   to at most one instance; if the pair is valid but the student is also enrolled elsewhere, that
   other enrollment is a separate scope with separate instances, attempts and awards.
5. `GET /me/challenge-assignments/{assignment_id}` may omit `enrollment_id` in the path because the
   existing `UNIQUE (cohort_id, student_user_id)` constraint guarantees at most one enrollment per
   student per cohort, so an assignment maps to at most one of the caller's enrollments. The response
   still returns `enrollment_id`, and a zero-match lookup is `404`. Every route that creates or reads
   mutable per-student state (instance issuance, instance read, attempts, scores) carries
   `enrollment_id` explicitly.

Convenience aggregate routes are additive only and must not weaken the above:

- `GET /me/challenges` MAY list assignments across all of the caller's active enrollments, but every
  row MUST include `enrollment_id` and `assignment_id`. The route must not imply that a challenge
  identifier alone is actionable.
- There is no `GET /me/challenges/{challenge_id}` and no
  `POST /me/challenges/{challenge_id}/instance`. A challenge identifier alone is ambiguous and would
  force the backend to guess an enrollment, which is prohibited.

#### 6.2.1 Cohort status, assignment status and the availability window

These are three distinct concepts and must not be conflated:

| Concept | Values | Effect on student work |
|---|---|---|
| `CourseCohort.status` (existing 02B lifecycle, unchanged) | `draft`, `active`, `completed`, `archived` | Only `active` authorizes instance issuance and attempts. `draft` is invisible. `completed` and `archived` are read-only history: no issuance, no submissions. |
| `challenge_assignments.status` (new, 03A) | `scheduled`, `active`, `closed`, `withdrawn` | `scheduled` = published but not yet open. `active` = open. `closed`/`withdrawn` = no further submissions. |
| Availability window (`availability_starts_at` .. `availability_ends_at`) | timestamps, may be `NULL` | The effective window is the **intersection** of the version default and the assignment window. Outside it, no issuance and no attempts. |

**Scheduled assignment visibility policy.** A student may *see* a scheduled assignment so they can
prepare, but seeing it never authorizes work:

- `GET /me/enrollments/{enrollment_id}/challenges` includes scheduled assignments with
  `attemptable: false`, `availability_starts_at`, and no instance or score data. This is a deliberate
  preparation affordance and reveals only published instructions that the class will need.
- `GET /me/challenge-assignments/{assignment_id}` returns instructions and the window with
  `attemptable: false`. It does not return an instance, attempt count or earned points.
- `POST .../instance` returns `409` before the window opens. It never issues a pre-loaded instance.
- Scheduling does not grant access to a target, a resource download, or a verification endpoint.

Instructors set `challenge_assignments.status = 'scheduled'` and the relevant timestamps at
assignment time; a background transition to `active` is optional and must never be required for
correctness, because the server evaluates status and window on every request.

### 6.3 Request validation and response rules

- Pydantic models with `extra="forbid"`; reject client-supplied `points`, `score`, `verdict`,
  `enrollment_id`, `user_id`, `challenge_version_id`, `instance_id` (in a body), timestamps and
  `attempt_number`. Path parameters are identifiers, never authorization evidence.
- A student path containing `enrollment_id` must be checked against the session user's own
  enrollment. A student path containing `assignment_id` must be checked against that enrollment's
  cohort. Supplying a valid identifier never substitutes for the ownership check.
- Effective score payloads always expose integer `awarded_points`, `adjustment_points`,
  `effective_points`, `max_points` and never a client-derived percentage alone.
- Authorization failures for foreign resources return `404`, not `403`, to conceal existence.
  Legitimate state conflicts (`409`), expired instances (`410`), throttling (`429`) and disabled
  methods (`501`) are documented and tested.
- Score adjustments are validated, not clamped: `422` for zero delta, empty reason, or invalid
  `points_before`; `409` when the requested `points_before` is stale or the resulting score would
  leave `[0, max_points_snapshot]`. The response names the violated bound and the current effective
  score; it never returns a silently corrected total.
- Every mutation requires same-origin validation. Score adjustments additionally require recent
  privileged reauthentication.
- `Cache-Control: no-store`, `Referrer-Policy: no-referrer` on challenge responses.
- Rate limits per user, per instance and per IP for attempts; per user for evidence upload and
  downloads; reuse `rate_limit_events`.

### 6.4 Idempotency and concurrency contract

Verification transaction:

1. Load instance `FOR UPDATE` (PostgreSQL); verify enrollment/ownership/window/attempt limit, and
   that the attempt's `enrollment_id` matches the instance.
2. Insert attempt row with server time and next `attempt_number`.
3. Verify with the enabled method only. A disabled method aborts before any award with `501`.
4. If accepted, insert award copying `max_points_snapshot` from the instance's version; a
   `UNIQUE (instance_id)` violation means another request already awarded — roll back this
   transaction, re-read the award, and return the original result.
5. Set instance status `solved` and `solved_at` once.
6. Audit and commit.

Adjustment transaction:

1. Load the award `FOR UPDATE`; verify the award's enrollment belongs to a cohort the actor is
   currently assigned to (instructor) or any cohort (administrator).
2. Verify that the award's enrollment and version match the adjustment targets (C9).
3. Compute `current_effective = sum(awards.points) + sum(adjustments.delta_points)` for that
   enrollment and version under the lock.
4. Require `request.points_before == current_effective`; otherwise `409` stale.
5. Require the reason to be non-empty after trimming; otherwise `422`.
6. Require `0 <= current_effective + delta_points <= max_points_snapshot`; otherwise `409` with the
   violated bound. **Do not clamp and do not persist a corrected value.**
7. Insert the adjustment, set `points_before`/`points_after`, write the audit row, commit.

Both transactions are serialized per instance/award by the row lock, so two concurrent requests
cannot each observe the same `points_before` and commit conflicting results.

`Idempotency-Key` replay returns the stored attempt result without a new attempt row. A repeated
successful flag never creates a second award or a second audit event. Unrelated integrity errors are
not swallowed.

## 7. Authorization matrix (summary)

| Capability | Student | Instructor | Manager | Administrator |
|---|---|---|---|---|
| List challenge assignments for an enrollment | own enrollment only | no (student routes) | no | no |
| Read one challenge assignment | own enrollment, `active` cohort | no | no | no |
| Issue/read instance | own enrollment + assignment in that `active` cohort | no | no | no |
| Submit attempt | own instance, own active enrollment | no | no | no |
| Read own attempt history and scores | own enrollment only | no | no | no |
| Download own challenge resource (03C) | own enrollment + assignment | no | no | no |
| Create/edit draft challenge | no | live-assigned course | no | **yes — no teaching assignment required** |
| Publish version | no | live-assigned course | no | **yes — no teaching assignment required** |
| Assign published version to a class | no | live-assigned cohort | no | **yes — any cohort, no assignment required** |
| Read class challenge results | no | live-assigned cohort, by assignment | read-only, by assignment | yes, any cohort |
| Adjust an existing award | no | live-assigned cohort + step-up | no | yes + step-up |
| Create standalone bonus/penalty (no award) | no | deferred to 03E | no | deferred to 03E |
| Manage central target profiles (03D) | no | no | no | yes + MFA |
| Withdrawn enrollment / removed instructor | own history only, no new attempts | access ends next request | existing history | existing history (role unaffected) |

Two independent paths grant `/instructor/*` access: **Instructor** with a current teaching assignment,
or **Administrator** with an explicitly authorized administrative capability. Administrator never
requires, and never receives, an implied teaching assignment. Instructor scope never widens into
administrative scope. Manager never gains Instructor write permissions.

Role is never sufficient on its own: every request re-validates enrollment status, cohort status
(must be `active` for student work), live instructor assignment, assignment-to-cohort membership and
challenge scope. A student identifier supplied by the client is only a lookup key; the authoritative
ownership comes from the session plus the enrollment row.

## 8. Performance and capacity

Design targets: 50 registered participants, ~50 concurrent authenticated submissions.

- Flag verification is CPU-trivial (one HMAC + one digest lookup plus transactional inserts);
  expected p95 well under 100 ms at this scale. The dominant cost is transaction and audit writes.
- Use one indexed lookup path per verification: `challenge_instances` by id → `challenge_awards`
  by `instance_id`. No table scan, no per-request aggregate over the class.
- Class result endpoints must paginate and aggregate in SQL, never N+1 per student.
- Give PostgreSQL a bounded connection pool; keep verification requests short; do not hold row locks
  across the network probe. For `trusted_target`, perform the probe under a timeout **before**
  taking the award lock, then re-check state inside the transaction.
- Dedicated load test at 50 concurrent submissions is an acceptance gate for 03A; record p95, error
  rate and lock-wait time.
- No per-student Kali VM allocation. Central training targets have separate capacity planning in
  03D, including per-target concurrency limits and reset cost.
- Evidence upload and malware scanning are the heaviest operations; they are out of the flag-verification
  critical path and are queued/limited.

## 9. Relationship to Milestone 02C

- 02C records self-attested lesson completion and derives learning progress. It is not grading.
- Challenge awards and adjustments are authoritative assessment evidence and must not be folded into
  the 02C percentage, completion count, or `needs_review` flags.
- A future UI may display both, clearly labeled ("course reading progress" vs "practical challenge
  points"). A combined transcript is Milestone 03E and requires an explicit, documented formula.
- No challenge activity writes `lesson_completion_events`; no lesson completion writes challenge
  awards.

## 10. Test and acceptance outline for 03A

1. Alembic upgrade/downgrade/upgrade on PostgreSQL and SQLite with 02A–02C data present.
2. Draft vs published version immutability; publishing a revision does not change an attempted
   version's `max_points` or verification config.
3. Assignment course/cohort consistency; instructor cannot assign outside a live class.
4. Instance issuance is idempotent per `(assignment, enrollment)`; two classes of the same course
   produce two independent instances and score scopes.
5. Correct flag awards exactly once; duplicate and concurrent submissions award once, with one audit
   event; original `awarded_at` preserved.
6. Wrong flag, shared foreign-instance flag, malformed payload, and over-limit attempts rejected
   uniformly without leaking expected values.
7. **Enrollment-scoped student identity:** for a student enrolled in two classes of the same course
   with the same challenge assigned to both,
   - `POST /me/enrollments/{A}/challenge-assignments/{assignment_in_B}/instance` returns `404`;
   - each enrollment gets its own instance, attempt count and score summary;
   - omitting `enrollment_id` from a student path is impossible; there is no route that resolves the
     "first" enrollment;
   - a second student's `enrollment_id` and a second student's `assignment_id` both return `404`;
   - the aggregate `GET /me/challenges` row for each assignment carries its own `enrollment_id` and
     `assignment_id`.
8. **Cross-table invariants C1–C11:** each has a negative test asserting no dependent row is written
   (module from another course, version from another challenge, assignment version mismatch, cohort of
   another course, enrollment outside the assignment's cohort, instance version drifting from the
   pinned version, attempt/award/adjustment enrollment or version mismatch).
9. **Adjustment validation, not clamping:** `delta_points` that would take the effective score below
   `0` or above `max_points_snapshot` returns `409` with the violated bound and no row is written;
   zero delta and empty reason return `422`; stale `points_before` returns `409`; a valid adjustment
   preserves `points_before`, `points_after`, reason, actor, timestamp and audit row; the effective
   score is never silently corrected.
10. **Award-required adjustments:** an adjustment against a nonexistent award returns `404`; an award
    outside the instructor's live-assigned cohort returns `404`; there is no endpoint that creates a
    standalone bonus or penalty; an adjustment cannot reference an award from another enrollment or
    version.
11. **Method enablement:** a version configured with `evidence` or `trusted_target` while the method
    is disabled is refused at publish and at assignment (`422`); attempting a disabled method returns
    `501` and creates no award; no route returns a successful grade for an unimplemented method; the
    shipped default configuration exposes only `flag`.
12. **Flag non-exposure in 03A:** no student response contains `flag_seed`, key generation, verifier
    digest, expected flag or prefix; synthetic fixture flags are not reachable from a student route.
13. Trusted-target SSRF matrix (03D): user-supplied host/URL ignored or rejected; non-approved
    profile, loopback, link-local and metadata addresses blocked; timeout enforced.
14. Evidence upload (03C) rejects oversized and disallowed types; stored outside web root; unscanned
    files are not readable by instructors; no automatic full award.
15. Authorization matrix tests: student-to-student, instructor-to-unassigned-class, manager write
    attempts, administrator step-up, withdrawn enrollment, removed instructor.
16. **Administrator without teaching assignment:** an Administrator who holds no `cohort_instructors`
    row can create a challenge, publish a version, assign it to a cohort, read results and adjust an
    award; no assignment row is created as a side effect; the audit trail records the Administrator
    role. The same operations as an Administrator still require privileged step-up for adjustments and
    MFA where configured.
17. **Role separation:** a Manager calling any `/instructor/*` write route gets `403`/`404` and cannot
    self-assign as instructor; an Instructor cannot read another class's results even when they also
    hold an Administrator role, unless the session's active role is Administrator; an Administrator
    who switches to Instructor loses administrative breadth for that session.
18. **Cohort status gating:** instance issuance and attempts succeed only with an `active` enrollment
    in an `active` cohort; `draft`, `completed` and `archived` cohorts refuse issuance and submission;
    a `scheduled` assignment in an `active` cohort is visible with `attemptable: false` and refused at
    issuance with `409`; no code path accepts or invents a `scheduled` cohort status.
19. Foreign resource IDs return `404`; rate limits return `429`; Origin/CSRF enforcement on all
    mutations.
20. 50-concurrent-submission load test with p95 and error-rate report, asserting zero duplicate
    awards and zero duplicate audit rows.
21. Contract parity: generated OpenAPI matches committed contract after implementation (Codex check).

## 11. Unresolved architectural decisions

1. Per-instance derived flags vs. static verifier digests for local-lab challenges with fixed
   offline artifacts. Resolved direction: per-instance derived flags; 03C generates the per-student
   package that embeds the discoverable flag (5.2.1). The remaining open question is only whether any
   challenge may use a static digest, and under what approval.
2. Evidence storage backend: local encrypted volume vs. S3-compatible object storage (MinIO).
   Recommendation: object storage with private bucket and signed URLs; confirm backup policy. (03C)
3. Whether managers may ever adjust scores. Current decision: no in 03A; a change requires an
   explicit, documented decision.
4. Partial-credit policy semantics for evidence review and multi-part challenges — deferred to 03E.
   Standalone bonuses and penalties without an award are also 03E.
5. Gradebook integration with Moodle (03E): one-way export, formula ownership and audit.
6. Proctoring/identity assurance when the student's Kali installation is untrusted; how much weight
   official assessment may place on local work.
7. Dedicated lab host procurement and VLAN ownership vs. a temporary isolated VM on the existing
   Ubuntu server.
8. Target reset orchestration and per-target capacity limits (03D).
9. Retention period for attempts, flags digests, evidence files and audit rows.
10. Whether class challenge results must be visible to managers across all classes or only assigned
    ones.
11. Whether a challenge may be assigned twice to the same cohort under two different versions. The
    schema permits it (`UNIQUE (challenge_version_id, cohort_id)`); product policy does not yet say
    whether that is desirable, so results are reported per assignment.
