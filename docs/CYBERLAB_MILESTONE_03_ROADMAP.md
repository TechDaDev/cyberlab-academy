# CyberLab Academy — Milestone 03 Roadmap: Local Kali Practical Challenges

**Status:** Proposed roadmap for review. No milestone below is approved to start implementation.  
**Prepared:** 2026-11-12.  
**Baseline:** `TechDaDev/cyberlab-academy` `main` at `9afc37fc986e1b530f26c53efa35ecd05c80958c`.  
**Precondition:** Milestone 02C must be accepted and merged, and this architecture must be reviewed
and approved by ChatGPT, before 03A implementation begins.

---

## Guiding constraints

- Students run real Kali Linux locally; the platform never hosts, streams or remotely controls Kali.
- The college server never executes arbitrary commands or user-supplied network destinations.
- `users`, `cohort_enrollments` and session authorization remain the single source of identity and
  scope. No second account database.
- Challenge scores are derived from immutable awards plus audited adjustments, and remain separate
  from Milestone 02C lesson progress.
- No challenge may authorize attacks against third-party systems or the production college network.
- Every milestone is delivered by a feature branch and a pull request into `main`; Codex performs
  independent focused QA on each PR and does not implement source changes.
- Contract changes are additive; a breaking change needs explicit approval and a version bump.

## Phase map

| Milestone | Scope | Owner | Depends on |
|---|---|---|---|
| 03A | Challenge Engine Backend | DeepSeek | 02C accepted; this architecture approved |
| 03B | Challenge Frontend | Arena AI | 03A merged and contract committed |
| 03C | Local Kali Challenge Packages | DeepSeek + Arena AI | 03A; content owner sign-off |
| 03D | Isolated Central Training Targets | DeepSeek + college infrastructure | 03A; network/host approval |
| 03E | Advanced Assessment | DeepSeek + Arena AI | 03B, 03C/03D evidence in production |

---

## Milestone 03A — Challenge Engine Backend

**Owner:** DeepSeek.  
**Goal:** server-authoritative challenge management, per-enrollment instances, attempt submission,
verification, scoring, audit and secure APIs. No frontend changes in this PR.

### Deliverables

1. Additive Alembic revision `0006_challenge_engine` creating: `challenge_target_profiles`,
   `challenges`, `challenge_versions`, `challenge_assignments`, `challenge_instances`,
   `challenge_evidence_submissions`, `challenge_attempts`, `challenge_awards`,
   `challenge_score_adjustments`, with documented upgrade/downgrade.
2. SQLAlchemy models following existing conventions (`String(36)` UUID PKs, UTC timestamps,
   named unique/check constraints).
3. Services for: draft/version lifecycle, publication, assignment, instance issuance, flag
   verification, award creation, adjustment recording, class result aggregation.
4. Flag verification with per-instance HMAC derivation, constant-time comparison, HMAC-digest
   storage of submissions, rate limiting and idempotency.
5. Trusted-target verification scaffold restricted to approved target profiles, declarative probes,
   timeouts and allowlists. Actual lab targets are 03D; 03A may ship the constrained verifier with
   profiles in `draft` and no live target.
6. Evidence metadata/upload authorization for the `evidence` method, with private storage,
   allowlist, size caps, SHA-256 and scan-gating hooks. Full local-lab evidence workflow may be
   completed in 03C.
7. REST routes under `/api/v1` exactly as proposed in
   [CYBERLAB_MILESTONE_03_ARCHITECTURE.md](CYBERLAB_MILESTONE_03_ARCHITECTURE.md), with Pydantic
   `extra="forbid"`, Origin enforcement, authorized-role checks, enrollment/class scope, rate limits,
   audit writes and `no-store` headers.
8. Additive OpenAPI contract regeneration committed with the implementation PR (after approval).
9. Backend tests listed in section 10 of the architecture document, including PostgreSQL concurrency
   and migration round-trips.
10. A 50-concurrent submission load test with p95 latency, error rate and lock-wait evidence.
11. Implementation report documenting routes, schema, semantics, limits, test results and any
    deviation from this proposal.

### Explicit non-goals

- No frontend, no `frontend/` edits, no changes to `shared-contracts/openapi.json` before approval.
- No live training target, no network rule changes, no server modification.
- No Moodle grade passback, no certificate issuance, no composite transcript.
- No mixing with 02C lesson progress.
- No automatic full points for uploaded evidence.

### Acceptance criteria

- Migration upgrades and downgrades cleanly on PostgreSQL and SQLite with 02A–02C data present.
- A first correct flag creates exactly one award; repeats and concurrent attempts create none.
- A published version's `max_points`, attempt limit and verification criteria cannot change.
- Attempts and awards are bound to `enrollment_id`; a student in two classes of the same course has
  two independent score records.
- Every foreign-resource read returns `404`; instructor scope is cohort-specific.
- No response, log or error exposes flags, digests, seeds or target credentials.
- Rate limits and Origin enforcement verified by automated tests.
- 50-concurrent load test passes with documented p95 and zero duplicate awards.
- Codex independent QA signs off on authorization, migration, concurrency and contract parity.

### Required independent QA (Codex)

Authorization matrix, migration round-trip, concurrency/idempotency, secret non-exposure, SSRF input
handling, rate-limit behavior, audit completeness, and OpenAPI parity with the running application.

---

## Milestone 03B — Challenge Frontend

**Owner:** Arena AI.  
**Goal:** instructor challenge management, student practical interface, submission and reporting UIs
against the committed 03A contract.

### Deliverables

1. Instructor: challenge list, draft editor, version history, publication checklist, class assignment,
   class results table with attempt detail, adjustment dialog with mandatory reason and
   reauthentication.
2. Student: assigned challenge list, instructions and authorized target description, attempt counter
   and deadline, flag submission form, evidence upload with progress and limits, validation feedback,
   attempt history, per-enrollment challenge score summary.
3. Manager/administrator: read-only class challenge statistics.
4. Clear labeling that practical points are separate from 02C course reading progress.
5. Accessible, responsive, keyboard-operable UI; explicit security messaging ("no attacks outside the
   authorized scope"); no secret, flag prefix or verifier detail rendered.
6. Frontend tests for submission, error and throttle states; contract-typed clients; no guessed
   endpoints.
7. Frontend report documenting screens, states and accessibility checks.

### Acceptance criteria

- No flag, seed, digest, target credential or other student's data appears in any client payload or
  rendered page.
- Attempt-limit, expired-instance, `409`, `410`, `422` and `429` states are handled distinctly.
- Instructor cannot select a class outside their live assignments.
- Adjustments require a reason and show before/after values; no client-side score editing.
- Empty, loading, error and unauthorized states are designed, not improvised.
- Screen-reader and keyboard checks pass; responsive layouts verified at lab-computer widths.

### Required independent QA (Codex)

Contract parity, authorization-state handling in the UI, secret non-exposure, CSRF/Origin behavior,
and verification that the UI cannot submit a client-controlled score or enrollment id.

---

## Milestone 03C — Local Kali Challenge Packages

**Owner:** DeepSeek (packaging, verification, evidence pipeline) with Arena AI (student delivery UI);
content authorship follows the existing educational-content rules.  
**Goal:** practical challenges that students complete on local Kali against downloaded, authorized
materials.

### Deliverables

1. Challenge resource model and authorized, short-lived downloads bound to assignment and enrollment.
2. Per-student artifact generation where content embeds the derived instance flag (for example a
   prepared target file, container image reference or dataset), reproducible from the instance seed.
3. Challenge package specification: instructions, scope statement, allowed tools, deliverables, time
   estimate, evidence requirements and explicit prohibition of out-of-scope attacks.
4. Evidence workflow completion: upload, scanning, instructor review queue, accept/reject with reason,
   award or adjustment creation.
5. Local-lab verification guidance: which challenges are flag-verified, which require evidence review,
   and why local evidence alone is not proof of completion.
6. Documentation for instructors on authoring a safe local-lab challenge and choosing a verification
   method.
7. Tests for download authorization, artifact determinism per instance, evidence scan gating, size
   and type enforcement, and review-to-award flow.

### Acceptance criteria

- Only currently assigned, actively enrolled students can download a resource; foreign IDs `404`.
- Artifact content is deterministic for one instance and differs across students where randomization
  is configured.
- No artifact contains another student's flag, another instance's seed, credentials or production
  data.
- Uploaded evidence cannot be auto-awarded full points; a human decision or a specifically approved
  deterministic check is required.
- Instructor review records actor, reason, timestamp and before/after score.
- Content respects the "no third-party attacks, synthetic targets only" rule.

### Required independent QA (Codex)

Download authorization, artifact non-leakage, evidence pipeline abuse cases, scan gating and
review-award audit integrity.

---

## Milestone 03D — Isolated Central Training Targets

**Owner:** DeepSeek (verifier integration, target profiles, monitoring hooks) with college
infrastructure for network and host changes.  
**Goal:** Mode B exercises: students use local Kali against explicitly authorized targets on an
isolated laboratory network, with server-side trusted verification.

### Deliverables

1. Approved `challenge_target_profiles`, administrator-managed, with probe kinds and expected markers.
2. Verification runner deployed on the laboratory segment; one-way egress to approved targets only.
3. Network implementation per
   [CYBERLAB_PRACTICAL_LAB_SECURITY.md](CYBERLAB_PRACTICAL_LAB_SECURITY.md): isolated VLAN, default-deny
   firewall, no production route, explicit egress policy.
4. Target lifecycle: activation window, per-target concurrency quota, snapshot reset, quarantine of
   poisoned targets.
5. Per-student/target access mapping with authorization bound to class and enrollment.
6. Logging and monitoring: flow logs, probe logs, cross-segment deny alerts, reset failures.
7. Pre-flight security test matrix: SSRF attempts, cross-segment scans, metadata access, lateral
   movement and reset verification.
8. Runbook for target outage, compromise and class cancellation.

### Acceptance criteria

- A student can reach only assigned targets and only during an active window.
- No target can reach Moodle, the CyberLab database, secret stores, metadata endpoints or server
  management interfaces; proven by test.
- The application ignores any student-supplied host, URL, port or path; only approved profile IDs are
  honored.
- Probe timeouts, size caps and no-redirect rules are enforced and tested.
- Reset returns the target to a known clean state and is logged.
- Capacity planning documents concurrent targets independent of the 50 concurrent platform
  submissions.
- No change to production services without an approved maintenance window.

### Required independent QA (Codex)

SSRF and allowlist matrix, network isolation evidence, reset correctness, concurrency quotas,
credential non-exposure and audit completeness.

---

## Milestone 03E — Advanced Assessment

**Owner:** DeepSeek and Arena AI; academic policy decisions by ChatGPT and the institution.  
**Goal:** richer scoring policies, reporting and optional gradebook integration.

### Deliverables

1. Configurable scoring policies: partial credit, multi-part flags, weighted sections, time bonuses
   only where pedagogically justified, best-attempt vs last-attempt policy.
2. Academic reporting: per-student, per-class and per-course practical assessment summaries with
   export, explicitly separated from 02C reading progress.
3. Instructor review workflow expansion: rubric support, annotations, appeal/review state.
4. Optional Moodle gradebook integration: one-way, idempotent, audited export of derived practical
   totals with an explicit formula and manual override policy.
5. Retention and archival policy for attempts, evidence and audit rows.
6. Analytics for assessment quality: per-challenge pass rate, time-to-solve distribution,
   discrimination indicators, without exposing individual flags.
7. Documentation of the composite-transcript formula if one is approved.

### Acceptance criteria

- Every reported number traces to awards and adjustments; no stored client totals.
- Score exports are reproducible for a given timestamp and enrollment state.
- Moodle export, if enabled, is idempotent and records external IDs; failures are retryable and
  audited.
- Adjustments never destroy prior values; appeals retain full history.
- Retention/archival actions are audited and do not silently remove grades.
- Managers can read reports only within their authorized scope.

### Required independent QA (Codex)

Derivation correctness against raw awards, export idempotency, authorization scope, audit integrity
and privacy of other students' records.

---

## Sequencing and gates

1. **Gate A:** Milestone 02C accepted and merged; PR #12 reviewed, not merged as part of this task.
2. **Gate B:** This architecture reviewed and approved by ChatGPT.
3. **Gate C:** 03A implementation merged with Codex QA; contract committed.
4. **Gate D:** 03B integrated against the committed contract, not against guesses.
5. **Gate E:** 03C content and evidence workflow accepted.
6. **Gate F:** 03D network and target isolation independently verified before any live class use.
7. **Gate G:** 03E policy approval before gradebook integration.

No milestone begins implementation before its gate is satisfied. Documentation, threat-model updates
and test plans may be revised at any gate without changing application code.
