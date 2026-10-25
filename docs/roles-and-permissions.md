# Role policy v0.1

Roles are assignable independently; active role is a UI/context selection validated by the backend.

| Operation | Student | Instructor | Manager | Administrator |
|---|---|---|---|---|
| Own profile / missions | Yes | Yes | Yes | Yes |
| Assigned class teaching | No | Yes | Yes | Yes |
| Manage students/instructors | No | No | Yes | Yes |
| Manage manager roles | No | No | No | Yes |
| Manage administrator roles | No | No | No | Yes |
| Set global security controls | No | No | No | Yes |
| Publish approved content | No | No | Yes | Yes |
| Read audits | No | No | Limited scoped | Yes |

## Account workflows
- Student signup: self-service, verified email before assessed use.
- Instructor application: verified email then Manager or Administrator approval.
- Manager/Administrator: invitation or privileged assignment only; no public signup.
- Administrator bootstrap: secure one-time out-of-band provisioning.
- Role grants/revocations: recorded actor, subject, before/after, reason, UTC timestamp.
- Prevent loss of the last enabled administrator.
- Administrative role activation: recent MFA/step-up verification.

Permissions above must be enforced server-side at both role and resource levels.
