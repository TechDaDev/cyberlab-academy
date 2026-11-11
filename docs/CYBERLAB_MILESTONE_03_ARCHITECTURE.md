# CyberLab Academy — Milestone 03: Local Kali Challenge Engine Architecture

**Status:** Proposed architecture for review; no route, model, migration or contract in this document is implemented.  
**Prepared:** 2026-11-12.  
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
| (new) `challenge_target_profiles` | added | Explicit target allowlist required for trusted-target verification |

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
| `status` | String(20) | `scheduled`, `active`, `closed`, `withdrawn` |
| `closed_at`, `closed_by` | | |

Constraints: `UNIQUE (challenge_version_id, cohort_id)`; `CHECK status IN (...)`; the assignment's
challenge course must equal the cohort course (validated server-side, covered by a test).

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
- Awards are immutable. No update or delete endpoint exists. A zero-point award is permitted only
  when a challenge is scored entirely through later adjustments, and must be justified in the
  implementation report.

### 4.7 `challenge_score_adjustments`

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `enrollment_id` | FK `cohort_enrollments.id` NOT NULL, indexed | |
| `challenge_version_id` | FK `challenge_versions.id` NOT NULL, indexed | Adjustment is scoped per assessment |
| `award_id` | FK `challenge_awards.id` NULL | Null means bonus/penalty without an award |
| `delta_points` | Integer ≠ 0 | Append-only delta |
| `points_before` | Integer | Effective score before the adjustment |
| `points_after` | Integer | Effective score after the adjustment; must equal `points_before + delta_points` |
| `reason` | String(500) NOT NULL | Required, non-empty |
| `actor_id` | FK `users.id` NOT NULL | |
| `actor_role` | String(20) NOT NULL | Active role used for the action |
| `created_at` | timestamptz | |

Constraints: `CHECK delta_points <> 0`; `CHECK points_after = points_before + delta_points`;
effective per-version score never below 0 (validated in the same transaction). Every adjustment also
writes an `audit_events` row in the same transaction.

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

| Column | Type | Notes |
|---|---|---|
| `id` | String(36) PK | |
| `label` | String(120) | Human name |
| `mode` | String(20) | `local_lab` or `central_target` |
| `host` | String(255) | Internal DNS name or address, admin-managed only |
| `port` | Integer 1..65535 | |
| `probe_kind` | String(40) | Predefined verifier, e.g. `http_expected_marker`, `tcp_banner` |
| `expected_value_digest` | String(64) NULL | HMAC of expected marker where applicable |
| `allowed_paths` | String(500) NULL | Newline-delimited fixed paths for the probe |
| `isolation_zone` | String(40) | Lab segment identifier |
| `status` | String(20) | `draft`, `approved`, `retired` |
| `created_by`, `approved_by` | FK `users.id` | `approved` requires administrator |
| `created_at` | timestamptz | |

Profiles are administrator-managed. Instructors select one; they never type a host or URL into an
assessment. This table is the allowlist that makes SSRF prevention structural.

### 4.10 Derived score, never stored as a total

For one enrollment:

```text
effective_points(enrollment, challenge_version)
  = coalesce(sum(awards.points), 0) + coalesce(sum(adjustments.delta_points), 0)
```

`effective_points` is clamped to `[0, max_points_snapshot]`. Challenge totals and course totals are
computed at read time. No client-supplied total, no persisted aggregate, and no mixing with the
Milestone 02C lesson-progress percentage.

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
- `challenge.evidence_uploaded`, `challenge.evidence_reviewed`
- `challenge.target_profile_approved`, `challenge.target_profile_retired`

Never place flags, digests, target credentials or file contents in `audit_events.detail`
(`String(500)`).

### 4.12 Migration strategy

- One additive Alembic revision after the 02C revision, for example `0006_challenge_engine`.
- `upgrade()` creates the new tables in dependency order: `challenge_target_profiles`, `challenges`,
  `challenge_versions`, `challenge_assignments`, `challenge_instances`,
  `challenge_evidence_submissions`, `challenge_attempts`, `challenge_awards`,
  `challenge_score_adjustments`; then the `challenges.current_version_id` FK.
- `downgrade()` drops in reverse order and must run cleanly on a database containing 02A–02C data.
- No existing table is altered. No column is removed or renamed.
- SQLite local tests and a PostgreSQL upgrade/downgrade/upgrade cycle are both required.

## 5. Verification methods

### 5.1 Flag verification

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

### 5.2 Trusted target verification

- The verifier accepts only `target_profile_id` and a `validation_rule` from the challenge version.
  It never accepts a host, URL, port, path, command or query from a student request.
- Resolution order: profile row → approved status → assigned isolation zone → profile host/port →
  fixed probe implementation selected by `probe_kind`.
- Probes are in-process, declarative and bounded: fixed connect/read timeouts (≤ 5 s), response size
  cap (≤ 64 KiB), no redirect following, no TLS verification bypass, no arbitrary headers.
- A dedicated verification runner on the laboratory segment performs the egress. The application
  server does not hold broad lab-network routing.
- Denied destinations for any probe implementation: loopback, link-local (including
  `169.254.169.254`), multicast, unspecified, and any address outside the approved profile.
- The student cannot supply the verifier result; only the runner's signed outcome is recorded.
- Repeated verification of the same instance is idempotent and does not re-award.

### 5.3 Evidence submission

- Upload is a two-step flow: create metadata/authorization, then stream the bytes to a dedicated
  storage path. The application never executes, interprets or serves the file inline.
- Enforced: format allowlist (PDF, plain text, Markdown, PNG/JPEG; PCAP only when explicitly
  enabled), size cap, filename sanitization, random object key, SHA-256, MIME sniffing, and an
  anti-malware scan before an instructor can open it.
- Files live outside the application document root, on a private volume or dedicated bucket, with
  per-enrollment authorization and short-lived signed download links.
- Automated validation may only *flag* plausibility. It never awards full points automatically.
  Instructor acceptance creates the award or adjustment with reason and audit history.

## 6. API architecture (Milestone 03A proposal, base `/api/v1`)

All routes use the existing cookie session, active-role authorization, `require_origin` on every
mutation, and the existing security headers. No GET has side effects. Nothing here may be added to
`shared-contracts/openapi.json` until 03A is approved and implemented.

### 6.1 Instructor and administrator

| Method | Path | Active role | Authorization and behavior |
|---|---|---|---|
| POST | `/instructor/challenges` | Instructor, Administrator | Instructor must have a live cohort assignment for the challenge course; Administrator any course. Creates draft challenge + draft version 1. `201`. |
| GET | `/instructor/challenges` | Instructor, Administrator | Scope: courses where the instructor has a live assignment. Filters `course_id`, `module_id`, `status`; paginated. `200`. |
| GET | `/instructor/challenges/{challenge_id}` | Instructor, Administrator | `404` when not in scope. `200`. |
| PATCH | `/instructor/challenges/{challenge_id}` | Instructor, Administrator | Draft-only metadata. `200`; `409` if a published version exists and the field is immutable. |
| POST | `/instructor/challenges/{challenge_id}/versions` | Instructor, Administrator | Creates new draft version from current. `201`; `409` if the challenge has zero published versions and v1 is still draft. |
| PATCH | `/instructor/challenge-versions/{version_id}` | Instructor, Administrator | Draft version only. Verification config, max points, attempt limit, window. `200`; `409` once published or attempted. |
| POST | `/instructor/challenge-versions/{version_id}/publish` | Instructor, Administrator | Validates completeness; sets `published_at`; updates challenge status/current version. `200`; `422` when invalid; `409` when already published. |
| POST | `/instructor/challenges/{challenge_id}/assignments` | Instructor, Administrator | Body: `cohort_id`, `challenge_version_id`, optional narrowed window. Live instructor assignment to cohort required. `201`; `409` duplicate; `422` course/version mismatch. |
| GET | `/instructor/challenges/{challenge_id}/assignments` | Instructor, Administrator | Scoped list. `200`. |
| POST | `/instructor/challenge-assignments/{assignment_id}/withdraw` | Instructor, Administrator | Soft close; refuses if submission in flight. `200`; `404` out of scope. |
| GET | `/instructor/cohorts/{cohort_id}/challenges` | Instructor, Administrator | Class challenge list with per-challenge completion and mean score. `404` if not live-assigned. `200`. |
| GET | `/instructor/cohorts/{cohort_id}/challenges/{challenge_id}/results` | Instructor, Administrator | Paginated per-enrollment rows: attempts used, best verdict, awarded points, adjustment total. No flags. `200`. |
| GET | `/instructor/cohorts/{cohort_id}/challenges/{challenge_id}/attempts/{attempt_id}` | Instructor, Administrator | Verdict detail, redacted submission digest, evidence metadata. `200`; `404` when the attempt is outside the class. |
| POST | `/instructor/challenge-awards/{award_id}/adjustments` | Instructor, Administrator | Requires reason; recent privileged reauthentication; records before/after; audit row. `201`; `409` if the requested `points_before` is stale; `422` invalid delta. |
| GET | `/admin/cohorts/{cohort_id}/challenge-results` | Manager, Administrator | Read-only class challenge statistics, same shape as instructor results. Managers cannot adjust scores. `200`. |
| POST | `/admin/challenge-target-profiles` | Administrator | Creates a target profile in `draft`. `201`. |
| POST | `/admin/challenge-target-profiles/{id}/approve` | Administrator | MFA/step-up required; allowlist activation. `200`; `409` already approved. |
| POST | `/admin/challenge-target-profiles/{id}/retire` | Administrator | Stops future verification use. `200`. |

Managers may inspect class-level challenge progress and scoring statistics. Managers may not author,
assign, verify or adjust challenge results in 03A; a later milestone may widen this after review.

### 6.2 Student

| Method | Path | Active role | Authorization and behavior |
|---|---|---|---|
| GET | `/me/challenges` | Student | Only assignments for active enrollments in active/scheduled classes within the effective window. Returns assignment summary and instance status. `200`. |
| GET | `/me/challenges/{challenge_id}` | Student | Instructions, authorized target description, resources, attempt allowance, earned points. **No flag, digest, verifier detail or target credentials.** `200`; `404` when not assigned. |
| POST | `/me/challenges/{challenge_id}/instance` | Student | Idempotently issues or returns the instance for the caller's enrollment. `201` first issue, `200` existing; `403` inactive enrollment; `409` window closed; `410` instance revoked. |
| GET | `/me/challenges/{challenge_id}/instance` | Student | Own instance state, attempts used/remaining, deadline. `200`; `404`. |
| POST | `/me/challenge-instances/{instance_id}/attempts` | Student | Body: `kind` + `flag` or `evidence_submission_id`. Requires `Idempotency-Key`. `201` accepted, `200` replay, `202` pending review, `409` already solved or limit reached, `410` expired/revoked, `422` malformed, `429` throttled. |
| GET | `/me/challenge-instances/{instance_id}/attempts` | Student | Own attempt history, newest first, paginated. `200`; `404`. |
| POST | `/me/challenge-instances/{instance_id}/evidence` | Student | Metadata + upload authorization for evidence method. `201`; `413` too large; `415` unsupported format; `429`; `503` scanner unavailable. |
| GET | `/me/enrollments/{enrollment_id}/challenge-scores` | Student owner | Per-challenge awards, adjustments, derived totals, attempt counts. `200`; `404` for another enrollment. |
| GET | `/me/challenge-resources/{resource_id}` | Student | Issues a short-lived signed download for an assigned resource. `200`; `404` when not assigned; `429` abusive download rate. |

### 6.3 Request validation and response rules

- Pydantic models with `extra="forbid"`; reject client-supplied `points`, `score`, `verdict`,
  `enrollment_id`, `user_id`, `challenge_version_id`, `instance_id` (in a body), timestamps and
  `attempt_number`.
- Effective score payloads always expose integer `awarded_points`, `adjustment_points`,
  `effective_points`, `max_points` and never a client-derived percentage alone.
- Authorization failures for foreign resources return `404`, not `403`, to conceal existence.
  Legitimate state conflicts (`409`), expired instances (`410`), throttling (`429`) are documented
  and tested.
- Every mutation requires same-origin validation. Score adjustments additionally require recent
  privileged reauthentication.
- `Cache-Control: no-store`, `Referrer-Policy: no-referrer` on challenge responses.
- Rate limits per user, per instance and per IP for attempts; per user for evidence upload and
  downloads; reuse `rate_limit_events`.

### 6.4 Idempotency and concurrency contract

Verification transaction:

1. Load instance `FOR UPDATE` (PostgreSQL); verify enrollment/ownership/window/attempt limit.
2. Insert attempt row with server time and next `attempt_number`.
3. Verify.
4. If accepted, insert award; a `UNIQUE (instance_id)` violation means another request already
   awarded — roll back this transaction, re-read the award, and return the original result.
5. Set instance status `solved` and `solved_at` once.
6. Audit and commit.

`Idempotency-Key` replay returns the stored attempt result without a new attempt row. A repeated
successful flag never creates a second award or a second audit event. Unrelated integrity errors are
not swallowed.

## 7. Authorization matrix (summary)

| Capability | Student | Instructor | Manager | Administrator |
|---|---|---|---|---|
| Read own assignments, instance, attempts, scores | own enrollment only | no (student routes) | no | no |
| Submit attempt | own active enrollment | no | no | no |
| Create/edit draft challenge | no | live-assigned course | no | yes |
| Publish version | no | live-assigned course | no | yes |
| Assign to class | no | live-assigned cohort | no | yes |
| Read class challenge results | no | live-assigned cohort | yes, read-only | yes |
| Adjust score | no | live-assigned cohort + step-up | no | yes + step-up |
| Manage target profiles | no | no | no | yes + MFA |
| Withdrawn enrollment / removed instructor | existing history only | access ends next request | existing history | existing history |

Role is never sufficient on its own: every request re-validates enrollment status, cohort status,
live instructor assignment and challenge scope.

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
7. Trusted-target SSRF matrix: user-supplied host/URL ignored or rejected; non-approved profile,
   loopback, link-local and metadata addresses blocked; timeout enforced.
8. Evidence upload rejects oversized and disallowed types; stored outside web root; unscanned files
   are not readable by instructors; no automatic full award.
9. Authorization matrix tests: student-to-student, instructor-to-unassigned-class, manager write
   attempts, administrator step-up, withdrawn enrollment, removed instructor.
10. Adjustment preserves `points_before`, `points_after`, reason, actor, timestamp and audit row;
    stale `points_before` produces `409`.
11. Foreign resource IDs return `404`; rate limits return `429`; Origin/CSRF enforcement on all
    mutations.
12. 50-concurrent-submission load test with p95 and error-rate report.
13. Contract parity: generated OpenAPI matches committed contract after implementation (Codex check).

## 11. Unresolved architectural decisions

1. Per-instance derived flags vs. static verifier digests for local-lab challenges with fixed
   offline artifacts. Recommendation: derived flags with a downloadable per-student artifact that
   embeds the flag.
2. Evidence storage backend: local encrypted volume vs. S3-compatible object storage (MinIO).
   Recommendation: object storage with private bucket and signed URLs; confirm backup policy.
3. Whether managers may ever adjust scores (currently administrator/instructor only).
4. Partial-credit policy semantics for evidence review and multi-part challenges.
5. Gradebook integration with Moodle (03E): one-way export, formula ownership and audit.
6. Proctoring/identity assurance when the student's Kali installation is untrusted; how much weight
   official assessment may place on local work.
7. Dedicated lab host procurement and VLAN ownership vs. a temporary isolated VM on the existing
   Ubuntu server.
8. Target reset orchestration and per-target capacity limits (03D).
9. Retention period for attempts, flags digests, evidence files and audit rows.
10. Whether class challenge results must be visible to managers across all classes or only assigned
    ones.
