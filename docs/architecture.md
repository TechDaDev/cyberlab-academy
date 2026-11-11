# Architecture v0.2

## Services
- Frontend: Next.js/TypeScript, UI via Arena AI. Code types target the committed OpenAPI contract.
- Backend: FastAPI/Python, PostgreSQL, Alembic; REST endpoints with OpenAPI.
- Challenge engine: server-authoritative practical challenges, per-enrollment instances, verification,
  scoring and reporting (Milestone 03; see [CYBERLAB_MILESTONE_03_ARCHITECTURE.md](CYBERLAB_MILESTONE_03_ARCHITECTURE.md)).
- Student Kali Linux: installed locally on college laboratory computers (dual boot). CyberLab Academy
  does not host, stream, virtualize or remotely control Kali, and does not provision permanent
  operating-system accounts on student machines.
- `simulation-engine/`: TypeScript deterministic browser content for non-Kali educational simulation
  (quizzes, diagrams, decision exercises). It is not a challenge execution or grading runtime.
- Isolated training targets: optional central targets on a dedicated laboratory network with trusted
  server-side verification (Milestone 03D).

### Superseded design
The former plan to simulate Kali Linux inside the browser is superseded by the approved local-Kali
architecture. Browser-based educational simulation unrelated to Kali remains valid for later work.

## Backend data boundaries
- Users, assigned roles, active role, verification, sessions, recovery and MFA. `users` is the single
  authoritative identity store; no second student account database.
- Classes and enrollments: instructors can only access their assigned classes; managers and
  administrators have broader read scope, and role alone never grants unconditional access.
- Milestone 02C lesson completion: immutable, version-specific, self-attested reading evidence with
  derived progress. Not grading.
- Milestone 03 challenge attempts, awards and adjustments: bound to the exact enrollment, server-time
  stamped, versioned criteria, derived scores, separate from 02C progress.
- Immutable-style audit events for security and grade changes; every score adjustment records prior
  value, reason, actor and timestamp.

## Challenge engine boundaries
- Instructors author challenges and versions, assign a published version to an authorized class, and
  review results; students view assignments, perform the exercise on local Kali and submit flags or
  evidence.
- Published challenge versions are immutable. Editing after an attempt requires a new version; an
  assignment cannot silently change the maximum score or verification criteria under a student.
- Only three verification methods exist: flag verification (per-instance derived flags preferred),
  trusted target verification through administrator-approved target profiles, and evidence
  submission with instructor review.
- The server never executes student commands, never accepts a student-supplied internal URL or host,
  and never allocates a Kali VM per participant.
- Practical scores derive from authoritative awards plus documented adjustments; no client-supplied
  total is stored or trusted.

## Laboratory network
Training targets run on an isolated laboratory segment with default-deny firewall rules, no route to
production Moodle, databases or server management, and instructor-controlled activation. See
[CYBERLAB_PRACTICAL_LAB_SECURITY.md](CYBERLAB_PRACTICAL_LAB_SECURITY.md).

## Milestone 01 acceptance
Registration, email verification, login/logout, recovery, profile updates, account statuses, instructor approval, role assignment/switching, last-admin protections, MFA for admin, audit logs, automated authorization tests.

## API rules
- Version APIs under /api/v1.
- Pydantic validation and versioned OpenAPI contract.
- Never trust role, user ID, timestamps or grades from client input.
- Security-sensitive operations are rate-limited and logged; no unbounded terminal execution.
