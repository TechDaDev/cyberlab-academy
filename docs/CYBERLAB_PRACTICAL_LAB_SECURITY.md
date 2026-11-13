# CyberLab Academy — Practical Lab Security Architecture

**Status:** Proposed architecture for review; no control described here is implemented by this document.  
**Prepared:** 2026-11-12.  
**Revised:** 2026-11-13 — aligned with enrollment-scoped student routes, award-bound adjustments,
rejected score bounds, central-target-only profiles and verification-method gating.  
**Revised again:** 2026-11-13 — separate Instructor and Administrator authorization paths; frontend may
not expose a verification method before its backend is enabled.  
**Baseline:** `TechDaDev/cyberlab-academy` `main` at `9afc37fc986e1b530f26c53efa35ecd05c80958c`.  
**Applies to:** Milestones 03A–03E (challenge engine, evidence handling, isolated training targets).

---

## 1. Scope and security principles

- Students use **real Kali Linux** locally. CyberLab Academy does not host, stream or control it.
- The **college server** remains a production academic host (Moodle, monitoring, CyberLab Academy).
  It never executes student-supplied commands, shells, scripts or URLs.
- **Training targets are deliberately vulnerable** and therefore untrusted. They must not be able to
  reach production academic services.
- **Identity is authoritative** in CyberLab Academy; practical results are bound to the exact
  enrollment, not merely to the user.
- **Scores are server-derived** from immutable awards plus audited adjustments. No client input
  becomes a grade.
- **Defaults are deny**: no port, destination, file type or role is allowed unless explicitly listed.

## 2. Trust model and its limits

| Component | Trust | Consequence |
|---|---|---|
| Browser | untrusted | Any client-side state can be forged |
| Local Kali installation | untrusted | Files, binaries, timestamps and local logs can be edited |
| Challenge package / artifact | untrusted | Downloaded content may be tampered with |
| College server (app + DB) | trusted | Holds verification keys and authoritative state |
| Verification runner | trusted, constrained | Declarative probes only; no arbitrary execution |
| Training target | untrusted by design | Assumed compromised after student access |
| Lab network | restricted | Isolated segment with explicit policy |

### 2.1 Explicit limitation: local evidence is not proof

Because students have full control of their Kali installation, the following cannot be treated as
proof of genuine completion:

- Local shell history, screenshots, terminal recordings, local log files, or tool output.
- Files produced entirely on the student machine, including "captured" artifacts.
- Any client-supplied timestamp, duration, hash or score.
- Self-reported statements of completion.

Acceptable mitigation, from weakest to strongest:

1. Self-attested completion (Milestone 02C), clearly labeled and never graded as practical work.
2. Evidence submission reviewed by an instructor (supports corrections, not certainty).
3. **Randomized per-instance flags** derived from a server secret and instance seed, which cannot be
   obtained without interacting with the assigned task instance (or receiving one from a classmate,
   which rate limits and per-instance derivation make detectable and non-transferable). The flag
   becomes discoverable only through the per-student package delivered in Milestone 03C; 03A verifies
   the flag but ships no usable exercise artifact.
4. **Trusted central target verification** (03D), where a server component observes the target's
   real state and the student cannot influence the verifier.

Rule: when a challenge must withstand deliberate cheating for an official grade, do not rely on local
evidence alone. Use per-instance randomized material or trusted target verification.

## 3. Threat model

Each threat lists the primary controls. "Residual risk" is what remains after 03A–03D as scoped.

### T1 — Student flag sharing

- **Risk:** one student solves and shares the flag with classmates.
- **Controls:** per-instance derived flags (`HMAC(server key, instance seed + challenge version)`);
  the 03C package builder writes only the derived flag for that one instance into the artifact and
  never writes the key, the seed, the key generation or another instance's data; static flags only as
  a documented last resort, stored as HMAC digests; per-instance attempt limits; per-user and
  per-instance rate limits; award evidence records the winning instance.
- **Residual:** collusion where a student submits another student's flag is rejected because flags
  are instance-bound and a package dump reveals only the student's own flag. A student may still be
  walked through the solution verbally; trusted target verification or randomized parameters reduce
  this. In 03A there is no distributable artifact at all, so a real exercise cannot yet be shared.

### T2 — Attempt flooding and brute-force submissions

- **Risk:** high-volume guessing of short flags or denial of service on verification.
- **Controls:** per-instance `attempt_limit` enforced transactionally; per-user, per-instance and
  per-IP rate limits reusing `rate_limit_events`; uniform response timing and body on rejection;
  global request-size and JSON-depth limits; verification endpoint cost bounded and measured.
- **Residual:** distributed guessing from many accounts; mitigated by per-instance derived flags
  with sufficient entropy plus per-user limits and monitoring.

### T3 — Duplicate point awards

- **Risk:** concurrent or replayed successful submissions award points twice.
- **Controls:** `UNIQUE (instance_id)` on `challenge_awards`;
  `UNIQUE (enrollment_id, challenge_version_id)` prevents a reissued instance from re-awarding;
  partial unique index for a single accepted attempt; transactional `FOR UPDATE` on the instance;
  `Idempotency-Key` replay returns the original result; unique conflict is handled as idempotent
  success, not a 500. Adjustments always reference one existing award, so there is no second
  award-creation path and no standalone bonus endpoint in 03A.
- **Residual:** none identified in the designed model; concurrency tests on PostgreSQL are mandatory.

### T4 — Unauthorized access to another student's results

- **Risk:** guessed or enumerated IDs expose attempts, evidence or scores.
- **Controls:** every student route derives `student_user_id` from the session, requires an explicit
  `enrollment_id` in the path for discovery, assignment details and instance issuance, and verifies
  that the assignment belongs to that enrollment's cohort; the server never selects the first matching
  enrollment. Foreign IDs return `404`; opaque UUID keys; bounded pagination; no other student's
  identifiers in a payload; `Cache-Control: no-store`; one authorization failure body shape.
- **Residual:** none in the designed model; covered by authorization tests.

### T5 — Instructor access to unrelated classes

- **Risk:** an instructor reads or modifies another class's challenges or scores.
- **Controls:** live assignment check (`cohort_instructors.removed_at IS NULL`) on every request for
  the **Instructor** path; scope by `cohort_id`, never by `course_id` alone; instructor-authored
  challenges limited to courses with a live assignment; class result reads are assignment-scoped and
  require the exact cohort match for that assignment; score adjustments require the award's enrollment
  to be in a live-assigned cohort; removal revokes access on the next request.
- **Administrator path is separate and deliberate:** an Administrator reaches the same routes through
  administrative authority, not a teaching assignment. No `cohort_instructors` row is created for them,
  and the Instructor-scope checks do not apply. Administrator access still requires the active
  Administrator role, administrator MFA, and privileged step-up for adjustments; every action is
  audited with the Administrator role. Instructor scope is never widened into administrative scope, and
  a Manager never gains either.
- **Residual:** an instructor legitimately assigned to two classes may compare them; acceptable. An
  instructor who is removed mid-term may already have read data; `no-store` and the audit trail limit
  the impact.

### T6 — Manipulation of challenge scoring criteria

- **Risk:** an instructor changes `max_points`, attempt limits or verification rules after students
  attempted the challenge.
- **Controls:** immutable `challenge_versions`; attempts and awards reference the exact version;
  published versions cannot be patched; editing creates a new version; assignments pin a version;
  moving an assignment to a new version is refused once attempts exist; adjustments are the only
  permitted score change, must target an existing award, and require reason, actor and audit.
  An adjustment that would leave `[0, max_points_snapshot]` is rejected, so a grading criterion
  cannot be bypassed by inflating a total.
- **Residual:** administrators can still create a new version; existing attempts remain scored under
  their original version by design.

### T7 — Exposure of secret verification flags

- **Risk:** expected flags or verifier secrets leak through APIs, logs, exports or errors.
- **Controls:** flags never stored in plain text; per-instance flags derived on demand; static
  verifiers stored as HMAC digests; `flag_verifier_digest`, `flag_seed`, `flag_key_version` and target
  credentials excluded from all Pydantic response models; submission values stored only as HMAC
  digests; audit detail excludes secrets; error responses use bounded reason codes; constant-time
  comparison; application logs redact submission payloads.
- **Package boundary (03C):** the per-student package contains only that instance's derived flag and
  scenario material. It must never contain the server key, `flag_seed`, `flag_key_version`, another
  instance's data, or a derivation routine that reconstructs other students' flags. Package
  generation runs server-side, and the package is downloadable only through an authorized,
  rate-limited route. A student dumping their own package learns their own flag, which is the intended
  design.
- **Residual:** a database compromise exposes digests and seeds; key rotation and database
  confidentiality (encryption at rest, restricted roles) are deployment requirements. A leaked
  package reveals one flag for one instance; it cannot be replayed by another student. A student can
  also read their own flag without performing the exercise when the artifact embeds it as a readable
  value; per-instance derivation prevents sharing but not self-cheating, which is why official
  grades require trusted target verification or reviewed evidence (see 2.1).

### T8 — Malicious file uploads

- **Risk:** malware, polyglot files, path traversal, XXE, decompression bombs, stored XSS.
- **Controls:** format allowlist; size cap enforced before reading the body; server-side MIME sniffing;
  random opaque storage keys; original filename sanitized and display-only; storage outside the web
  root; anti-malware scan before instructor access; files served only via short-lived signed links
  with `Content-Disposition: attachment` and a separate origin; no server-side rendering or
  conversion in 03A–03C; per-user upload limits.
- **Residual:** zero-day malware may evade scanning; instructor opening files remains a risk, so
  scan-gated access and download warnings are required.

### T9 — SSRF through target verification

- **Risk:** a student or instructor supplies a host/URL that makes the server reach internal
  services.
- **Controls:** profiles describe **central targets only**; a local artifact exercise has no
  addressable destination and needs no profile; no destination input exists in any student or
  instructor request; destinations come only from administrator-approved `challenge_target_profiles`;
  a `draft` or `retired` profile fails closed instead of falling back; DNS/IP allowlist; loopback,
  link-local (including cloud metadata), multicast and unspecified addresses denied; fixed probe kinds
  only; bounded timeouts and response sizes; redirects disabled; credentials never returned.
- **Residual:** a compromised approved target could answer misleadingly; verification must compare
  against an expected digest, not mere reachability. Until 03D ships the runner, the method is
  disabled and attempts return `501` rather than a guessed verdict.

### T10 — Unauthorized scanning of college infrastructure

- **Risk:** students treat local Kali or an assigned target as a launch point against production.
- **Controls:** isolated lab VLAN with default-deny egress; no route from lab segment to server
  management, Moodle database or production subnets; per-student target access rules; explicit
  written authorization scope in every challenge; central logging/alerting on cross-segment traffic;
  clear prohibition in content and UI; abuse handling process.
- **Residual:** a dual-boot computer's other network interfaces are outside CyberLab Academy's
  control. Institutional policy, network segmentation and acceptable-use enforcement are required.

### T11 — Abuse of centrally hosted training targets

- **Risk:** one student consumes or damages a shared target, or uses it to attack others.
- **Controls:** per-target concurrency quotas; per-student session quotas; target reset snapshots;
  instructor-controlled activation windows; resource limits (CPU, memory, disk, connections);
  logging of all target access; target isolation per class where required; no shared target with
  production data.
- **Residual:** noisy-neighbor effects on shared targets; mitigate with dedicated targets per class
  or per cohort in 03D.

### T12 — Grade changes without audit history

- **Risk:** silent modification of a student's practical score.
- **Controls:** awards immutable; adjustments append-only and always bound to one existing award with
  `points_before`, `points_after`, reason, actor, active role and timestamp; `audit_events` row in the
  same transaction; recent privileged reauthentication for adjustments; stale `points_before` produces
  `409`; out-of-range results are rejected rather than clamped, so the stored total always equals the
  requested arithmetic; no client-set totals; no bulk silent update endpoint; no standalone bonus or
  penalty path in 03A.
- **Residual:** database-level tampering with DB administrator access; restrict DB credentials and
  retain external backups/audit shipping.

### T13 — Replay of previously completed challenge instances

- **Risk:** an old successful submission, instance or token is reused.
- **Controls:** instance-bound flags; unique accepted attempt; unique award per
  `(enrollment_id, challenge_version_id)`; instance and attempt rows are bound to one enrollment, so a
  replay from another class or another student fails the ownership check before verification; instance
  status transitions are one-way; expired/revoked instances reject submissions with `410`; idempotency
  keys are scoped to the instance and expire; signed download links are short-lived and single-purpose
  and bound to `(enrollment_id, assignment_id)`.
- **Residual:** none designed; verified by replay tests.

### T14 — Unauthorized access after enrollment withdrawal or instructor removal

- **Risk:** a withdrawn student or removed instructor keeps access.
- **Controls:** authorization re-checks live enrollment/assignment on every request, not cached in
  the session; active-role requirement; withdrawn enrollment loses write access immediately and keeps
  read-only history only where explicitly permitted; removed instructor loses class access on the
  next request; role deactivation ends access; no long-lived tokens. After withdrawal, the enrollment
  row still owns its historical instances and awards, but no new instance can be issued and no attempt
  can be submitted for that enrollment.
- **Residual:** an already-open browser tab can display cached data it fetched earlier; `no-store` and
  short-lived responses reduce exposure.

## 4. Additional controls

- **CSRF and origin:** every mutating route validates `Origin` and requires the same-origin
  canonical host already enforced by the platform; cookies remain `HttpOnly`, `Secure`,
  `SameSite` as configured.
- **Rate limiting:** per user, per instance, per IP and per action; recorded in `rate_limit_events`;
  thresholds documented and load-tested.
- **Input validation:** Pydantic `extra="forbid"`, bounded string lengths, enum-only status and
  verdict values, no raw SQL, no dynamic table names.
- **Sensitive-data protection:** no flags, digests, seeds, keys, target credentials, file contents or
  other students' data in responses, errors, logs or telemetry. Redact submission values before any
  diagnostic log.
- **Secret management:** verification keys via environment/secret store, versioned for rotation;
  never in Git, never in `.env` committed, never in `shared-contracts/openapi.json` examples.
- **Least privilege:** the application DB role owns only its schema; the verification runner has no
  database write access beyond recording signed outcomes; the app server has no broad route to the
  lab segment.
- **Availability:** bounded request size, timeouts on probes, queue awareness for evidence scanning,
  and graceful `503` when the scanner is unavailable.
- **Monitoring:** metrics for attempt rates, rejection ratios, unique-IP fan-out per instance,
  duplicate-award conflicts, probe failures and cross-segment denies.
- **Retention:** attempts, digests, evidence and audit rows retained per institutional policy;
  evidence deletion is audited and requires administrator action.
- **Method gating:** a verification method that is not implemented in the running milestone is
  disabled by configuration. Its routes return `501`, create no attempt verdict and no award, and are
  never presented as operational in UI, documentation or OpenAPI summaries. Enabling `evidence` in
  03C or `trusted_target` in 03D is an explicit release action with its own review.
- **Milestone 03A scope:** the challenge engine verifies flags and records audited scores. It ships no
  usable Kali exercise artifact, no evidence pipeline and no live training target. Testing uses
  synthetic fixture flags that are unreachable from student routes.
- **Frontend follows the backend, not the plan:** a UI must never expose an evidence-upload control,
  target-selection control or "pending review" state before the corresponding backend method is
  enabled. 03B is flag-only; evidence UI arrives in 03C, target UI in 03D. A `501` from a disabled
  method is rendered as "not available", never as a grade.

## 5. Isolated laboratory network design (03D)

```text
College production LAN
  |  (no inbound from lab; no route from lab to production)
  +-- CyberLab app server subnet  ---  HTTPS  ---  student browsers
  |        |
  |        +-- verification runner (one-way egress to lab segment only)
  |
  +-- Lab segment (dedicated VLAN / bridge, isolated)
           +-- target-A (vulnerable VM)
           +-- target-B
           +-- reset/management host (instructor only)
```

Requirements:

1. **Logical separation:** dedicated VLAN or bridge with no L2 adjacency and no routed path to
   production subnets, Moodle, database, hypervisor management or server administrative interfaces.
2. **Firewall:** default deny both directions. Allow only student-to-assigned-target ports and
   runner-to-target probe ports. Allow no target-initiated traffic to the app server or production.
3. **Restricted routing:** no NAT from the lab segment to the internet. Egress from targets is denied
   unless a specific exercise requires a documented, time-boxed allowance.
4. **Student access:** each student reaches only the targets assigned to their class and instance; no
   lateral target-to-target access unless explicitly part of the exercise and approved.
5. **No production access:** targets must not reach the Moodle database, the CyberLab database,
   secret stores, metadata services or administrative APIs.
6. **Reset and recovery:** snapshot-backed targets; instructor-triggered reset; reset before and
   after each class window; poisoned targets quarantined.
7. **Resource quotas:** per-target vCPU, memory, disk, connection and packet limits; class-level
   concurrency caps.
8. **Logging:** network flow logs, target logs and runner probe logs shipped off-segment; alerts on
   cross-segment attempts and scanning behavior.
9. **Instructor-controlled activation:** targets start only within an authorized window and stop
   after it; no permanently exposed vulnerable host.
10. **Change control:** firewall and target topology changes reviewed by administrators; no
    instructor can widen a network rule through the application.

### 5.1 If a temporary VM is used on the existing Ubuntu host

The existing server runs production academic services. A vulnerable target on the same host is
acceptable **only** under all of these boundaries:

- Dedicated isolated virtual network (no host bridge to the production LAN), no host port
  forwarding to target services.
- Target VM cannot reach the host's loopback services, database ports or hypervisor management.
- Hard caps: 2 vCPU, 4 GB RAM, 40 GB disk, no passthrough; no GPU use.
- No shared folders, no host filesystem mounts, no Docker socket, no host network namespace.
- Snapshot-based reset after every class; the VM is powered off outside windows.
- Host-level firewall rules that explicitly deny lab-to-production traffic, verified by a test.
- Capacity reserved so Moodle and monitoring are not starved; the VM is the first thing stopped
  under memory pressure.

Preferred long-term design: a **dedicated lab host** (separate physical machine) for higher-risk
targets, with the college server handling only authentication, scoring and reporting.

## 6. Incident response expectations

- A reported flag leak, scoring anomaly or unauthorized target access triggers immediate challenge
  or target suspension.
- Evidence retention must support investigation: immutable attempts, audit rows and network logs.
- Key rotation invalidates future verifiers without corrupting historical awards.
- Any suspected cross-segment intrusion is handled by the college's network/security process, not by
  CyberLab Academy autonomously scanning the network.
