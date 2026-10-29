"""Milestone 02B: classes, instructor assignments, enrollments and lesson authorization.

Focused development checks; independent integration QA belongs to Codex.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (AuditEvent, CohortEnrollment, CohortInstructor, CourseCohort,
                        ModuleLesson, Role, Session, User)
from app.security import digest_token, now
from test_milestone_01b import (ORIGIN, PASSWORD, admin_ready, login, register,
                                verify_email)
from test_milestone_02a_catalog import (LESSON_BODY, create_course, create_lesson,
                                        create_module, publish)
from test_postgres_integration import postgres_client  # noqa: F401  (pytest fixture)

CONTRACT = Path(__file__).resolve().parent.parent.parent / "shared-contracts" / "openapi.json"


# --------------------------------------------------------------------------- fixtures

def user_id(dbmaker, email: str) -> str:
    with dbmaker() as db:
        return db.query(User).filter_by(email=email).one().id


def new_client():
    client = TestClient(app)
    client.headers.update(ORIGIN)
    return client


def make_user(admin, dbmaker, mail_dir, email, *, roles: tuple[str, ...] = (),
              verify: bool = True) -> str:
    assert register(admin, email).status_code == 202
    if verify:
        assert verify_email(admin, mail_dir).status_code == 200
    target = user_id(dbmaker, email)
    for role in roles:
        granted = admin.post(f"/api/v1/admin/users/{target}/roles",
                            json={"role": role, "reason": "Milestone 02B fixture"})
        assert granted.status_code == 200, granted.text
    return target


def signed_in(email, role: str | None = None):
    client = new_client()
    assert login(client, email).status_code == 200
    if role:
        assert client.post("/api/v1/auth/active-role", json={"role": role}).status_code == 200
    return client


def published_catalog(admin, code="CEH-V12", title="Certified Ethical Hacker v12"):
    """A published course with one published module and lesson."""
    course = create_course(admin, code=code, title=title)
    module = create_module(admin, course["id"])
    lesson = create_lesson(admin, module["id"])
    assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/lessons/{lesson['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/modules/{module['id']}/publish").status_code == 200
    return {"course": course, "module": module, "lesson": lesson}


def make_cohort(admin, course_id, code="CEH-V12-A", name="Autumn cohort"):
    response = admin.post("/api/v1/admin/cohorts", json={
        "course_id": course_id, "code": code, "name": name})
    assert response.status_code == 201, response.text
    return response.json()


def active_class(admin, course_id, instructor_ids, code="CEH-V12-A"):
    cohort = make_cohort(admin, course_id, code=code)
    for instructor in instructor_ids:
        assigned = admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/instructors",
                              json={"instructor_user_id": instructor})
        assert assigned.status_code == 201, assigned.text
    activated = admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate")
    assert activated.status_code == 200, activated.text
    return activated.json()


def enroll(admin, cohort_id, student_id):
    return admin.post(f"/api/v1/admin/cohorts/{cohort_id}/enrollments",
                      json={"student_user_id": student_id})


# ------------------------------------------------------------------------- lifecycle

def test_cohort_lifecycle_transitions_and_activation_gates(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    draft_course = create_course(admin, code="GATE-01", title="Gate course")
    cohort = make_cohort(admin, draft_course["id"])
    assert cohort["status"] == "draft"
    assert cohort["active_instructor_count"] == 0 and cohort["active_enrollment_count"] == 0

    duplicate = admin.post("/api/v1/admin/cohorts", json={
        "course_id": draft_course["id"], "code": "CEH-V12-A", "name": "Duplicate"})
    assert duplicate.status_code == 409
    missing_course = admin.post("/api/v1/admin/cohorts", json={
        "course_id": "00000000-0000-0000-0000-000000000000", "code": "X-1", "name": "Missing"})
    assert missing_course.status_code == 404
    bad_dates = admin.post("/api/v1/admin/cohorts", json={
        "course_id": draft_course["id"], "code": "X-2", "name": "Bad dates",
        "starts_at": "2026-09-01T00:00:00Z", "ends_at": "2026-08-01T00:00:00Z"})
    assert bad_dates.status_code == 422
    unknown_field = admin.post("/api/v1/admin/cohorts", json={
        "course_id": draft_course["id"], "code": "X-3", "name": "Status smuggle",
        "status": "active"})
    assert unknown_field.status_code == 422

    # Activating requires a published course first.
    instructor = make_user(admin, dbmaker, mail_dir, "gate-instructor@example.org",
                           roles=("instructor",))
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/instructors",
                      json={"instructor_user_id": instructor}).status_code == 201
    blocked_course = admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate")
    assert blocked_course.status_code == 409
    assert "Publish the course" in blocked_course.json()["detail"]

    assert publish(admin, f"/admin/courses/{draft_course['id']}/publish").status_code == 200

    # ... and at least one eligible instructor.
    empty = make_cohort(admin, draft_course["id"], code="EMPTY-01", name="No instructors")
    no_instructor = admin.post(f"/api/v1/admin/cohorts/{empty['id']}/activate")
    assert no_instructor.status_code == 409
    assert "instructor" in no_instructor.json()["detail"]

    activated = admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate")
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"
    assert activated.json()["active_instructor_count"] == 1
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate").status_code == 409

    completed = admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/complete")
    assert completed.status_code == 200 and completed.json()["status"] == "completed"
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/complete").status_code == 409
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/archive").status_code == 200
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/complete").status_code == 409
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/archive").status_code == 409

    # Draft classes may be archived directly; course_id and status are not patchable.
    patched = admin.patch(f"/api/v1/admin/cohorts/{empty['id']}", json={"name": "Renamed class"})
    assert patched.status_code == 200 and patched.json()["name"] == "Renamed class"
    assert admin.patch(f"/api/v1/admin/cohorts/{empty['id']}",
                       json={"status": "active"}).status_code == 422
    assert admin.patch(f"/api/v1/admin/cohorts/{empty['id']}",
                       json={"course_id": draft_course["id"]}).status_code == 422
    assert admin.post(f"/api/v1/admin/cohorts/{empty['id']}/archive").status_code == 200

    with dbmaker() as db:
        actions = {row.action for row in db.query(AuditEvent).filter(
            AuditEvent.subject_id.in_([cohort["id"], empty["id"]])).all()}
    assert {"cohort.created", "cohort.updated", "cohort.activated", "cohort.completed",
            "cohort.archived", "cohort.instructor_assigned"} <= actions


def test_instructor_eligibility_and_assignment_history(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin, code="ASSIGN-01", title="Assignment course")
    cohort = make_cohort(admin, course["id"])
    students_path = f"/api/v1/admin/cohorts/{cohort['id']}/instructors"

    assert admin.post(students_path, json={
        "instructor_user_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404
    student = make_user(admin, dbmaker, mail_dir, "assign-student@example.org")
    assert admin.post(students_path, json={"instructor_user_id": student}).status_code == 409
    instructor = make_user(admin, dbmaker, mail_dir, "assign-teacher@example.org",
                           roles=("instructor",))
    inactive = make_user(admin, dbmaker, mail_dir, "assign-inactive@example.org",
                         roles=("instructor",))
    assert admin.post(f"/api/v1/admin/users/{inactive}/suspend",
                      json={"reason": "Fixture suspension"}).status_code == 200
    assert admin.post(students_path, json={"instructor_user_id": inactive}).status_code == 409

    assigned = admin.post(students_path, json={"instructor_user_id": instructor})
    assert assigned.status_code == 201 and assigned.json()["active"] is True
    assert admin.post(students_path, json={"instructor_user_id": instructor}).status_code == 409

    removed = admin.delete(f"{students_path}/{instructor}")
    assert removed.status_code == 204
    assert admin.delete(f"{students_path}/{instructor}").status_code == 404
    history = admin.get(students_path).json()
    assert len(history) == 1 and history[0]["active"] is False
    assert history[0]["removed_at"] is not None

    reassigned = admin.post(students_path, json={"instructor_user_id": instructor})
    assert reassigned.status_code == 201
    assert reassigned.json()["id"] == assigned.json()["id"]  # soft row reused
    history = admin.get(students_path).json()
    assert len(history) == 1 and history[0]["active"] is True

    with dbmaker() as db:
        actions = [row.action for row in db.query(AuditEvent).filter(
            AuditEvent.subject_id == cohort["id"]).all()]
    assert actions.count("cohort.instructor_assigned") == 2
    assert actions.count("cohort.instructor_removed") == 1


def test_enrollment_eligibility_duplicates_and_transitions(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="ENROL-01", title="Enrollment course")
    instructor = make_user(admin, dbmaker, mail_dir, "enrol-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "enrol-student@example.org")
    unverified = make_user(admin, dbmaker, mail_dir, "enrol-unverified@example.org",
                           verify=False)
    cohort = make_cohort(admin, catalog["course"]["id"])

    assert enroll(admin, cohort["id"], student).status_code == 409  # draft class
    active = active_class(admin, catalog["course"]["id"], [instructor], code="ENROL-01-A")
    assert enroll(admin, active["id"], unverified).status_code == 409
    staff_only = make_user(admin, dbmaker, mail_dir, "enrol-staff@example.org",
                          roles=("instructor",))
    assert admin.request("DELETE", f"/api/v1/admin/users/{staff_only}/roles/student",
                         json={"reason": "Staff account needs no Student role"}).status_code == 200
    assert enroll(admin, active["id"], staff_only).status_code == 409
    assert enroll(admin, active["id"], "00000000-0000-0000-0000-000000000000").status_code == 404

    created = enroll(admin, active["id"], student)
    assert created.status_code == 201
    assert created.json()["status"] == "active"
    assert created.json()["course_id"] == catalog["course"]["id"]
    assert enroll(admin, active["id"], student).status_code == 409
    enrollment_id = created.json()["id"]

    withdrawn = admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                            json={"status": "withdrawn"})
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn" and withdrawn.json()["ended_at"]
    assert admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                       json={"status": "withdrawn"}).status_code == 409

    assert admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                       json={"status": "active"}).status_code == 200
    assert admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                       json={"status": "unknown"}).status_code == 422

    admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}", json={"status": "withdrawn"})
    assert admin.post(f"/api/v1/admin/cohorts/{active['id']}/complete").status_code == 200
    reactivate = admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                             json={"status": "active"})
    assert reactivate.status_code == 409
    assert "active class" in reactivate.json()["detail"]

    roster = admin.get(f"/api/v1/admin/cohorts/{active['id']}/enrollments").json()
    assert roster["total"] == 1 and roster["items"][0]["student_user_id"] == student


def test_concurrent_enrollment_cannot_duplicate(postgres_client, tmp_path):
    first, dbmaker, _ = postgres_client
    admin_ready(first, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(first, code="RACE-02", title="Race course")
    instructor = make_user(first, dbmaker, mail_dir, "race-teacher@example.org",
                           roles=("instructor",))
    student = make_user(first, dbmaker, mail_dir, "race-student@example.org")
    active = active_class(first, catalog["course"]["id"], [instructor], code="RACE-02-A")

    with TestClient(app) as second:
        second.headers.update(ORIGIN)
        second.cookies.set("cyberlab_session", first.cookies.get("cyberlab_session"))

        def attempt(client):
            return enroll(client, active["id"], student).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(attempt, first), executor.submit(attempt, second)]
            statuses = sorted(future.result() for future in futures)

    assert statuses == [201, 409]
    with dbmaker() as db:
        rows = db.scalars(select(CohortEnrollment).where(
            CohortEnrollment.cohort_id == active["id"])).all()
        assert len(rows) == 1


# ------------------------------------------------------------------- lesson access

def test_student_lesson_access_follows_enrollment_state(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="ACCESS-01", title="Access course")
    other = published_catalog(admin, code="ACCESS-02", title="Other course")
    instructor = make_user(admin, dbmaker, mail_dir, "access-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "access-student@example.org")
    active = active_class(admin, catalog["course"]["id"], [instructor], code="ACCESS-01-A")
    lesson_id = catalog["lesson"]["id"]

    client_student = signed_in("access-student@example.org", role="student")
    assert client_student.get(f"/api/v1/lessons/{lesson_id}").status_code == 403

    enrollment = enroll(admin, active["id"], student)
    assert enrollment.status_code == 201
    enrolled_view = client_student.get(f"/api/v1/lessons/{lesson_id}")
    assert enrolled_view.status_code == 200
    assert enrolled_view.json()["body_markdown"] == LESSON_BODY
    assert enrolled_view.headers["cache-control"] == "no-store"

    # Another course's published lesson stays out of reach.
    assert client_student.get(f"/api/v1/lessons/{other['lesson']['id']}").status_code == 403

    # Draft content inside the enrolled course stays out of reach.
    draft_lesson = create_lesson(admin, catalog["module"]["id"], sequence=2, title="Draft lesson")
    assert client_student.get(f"/api/v1/lessons/{draft_lesson['id']}").status_code == 403

    # Withdrawal revokes immediately, reactivation restores.
    enrollment_id = enrollment.json()["id"]
    admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}", json={"status": "withdrawn"})
    assert client_student.get(f"/api/v1/lessons/{lesson_id}").status_code == 403
    admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}", json={"status": "active"})
    assert client_student.get(f"/api/v1/lessons/{lesson_id}").status_code == 200

    # Completing the class revokes access even with an active enrollment row.
    assert admin.post(f"/api/v1/admin/cohorts/{active['id']}/complete").status_code == 200
    assert client_student.get(f"/api/v1/lessons/{lesson_id}").status_code == 403


def test_student_lesson_access_requires_verified_email(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="VERIFY-01", title="Verified course")
    instructor = make_user(admin, dbmaker, mail_dir, "verify-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "verify-student@example.org")
    active = active_class(admin, catalog["course"]["id"], [instructor], code="VERIFY-01-A")
    assert enroll(admin, active["id"], student).status_code == 201

    client_student = signed_in("verify-student@example.org", role="student")
    assert client_student.get(f"/api/v1/lessons/{catalog['lesson']['id']}").status_code == 200

    # An unverified account cannot be enrolled, and the enrollment gate re-checks the flag.
    with dbmaker() as db:
        db.query(User).filter_by(email="verify-student@example.org").one().email_verified = False
        db.commit()
    assert client_student.get(f"/api/v1/lessons/{catalog['lesson']['id']}").status_code == 403


def test_instructor_lesson_and_roster_scope(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="TEACH-01", title="Teaching course")
    other = published_catalog(admin, code="TEACH-02", title="Other teaching course")
    teacher = make_user(admin, dbmaker, mail_dir, "scope-teacher@example.org",
                        roles=("instructor",))
    outsider = make_user(admin, dbmaker, mail_dir, "scope-outsider@example.org",
                         roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "scope-student@example.org")

    class_a = active_class(admin, catalog["course"]["id"], [teacher], code="TEACH-01-A")
    class_b = active_class(admin, other["course"]["id"], [outsider], code="TEACH-02-A")
    assert enroll(admin, class_a["id"], student).status_code == 201

    teacher_client = signed_in("scope-teacher@example.org", role="instructor")
    assert teacher_client.get(
        f"/api/v1/lessons/{catalog['lesson']['id']}").status_code == 200
    assert teacher_client.get(f"/api/v1/lessons/{other['lesson']['id']}").status_code == 403

    listing = teacher_client.get("/api/v1/instructor/cohorts").json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == class_a["id"]
    roster = teacher_client.get(f"/api/v1/instructor/cohorts/{class_a['id']}/students")
    assert roster.status_code == 200
    assert [item["user_id"] for item in roster.json()["items"]] == [student]
    assert roster.headers["cache-control"] == "no-store"

    # Another class is invisible, not merely forbidden.
    assert teacher_client.get(f"/api/v1/instructor/cohorts/{class_b['id']}").status_code == 404
    assert teacher_client.get(
        f"/api/v1/instructor/cohorts/{class_b['id']}/students").status_code == 404

    # Removing the assignment revokes teaching access on the next request.
    assert admin.delete(
        f"/api/v1/admin/cohorts/{class_a['id']}/instructors/{teacher}").status_code == 204
    assert teacher_client.get(
        f"/api/v1/lessons/{catalog['lesson']['id']}").status_code == 403
    assert teacher_client.get("/api/v1/instructor/cohorts").json()["total"] == 0
    assert teacher_client.get(
        f"/api/v1/instructor/cohorts/{class_a['id']}/students").status_code == 404


def test_active_role_decides_each_surface(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="ROLE-01", title="Role course")
    dual = make_user(admin, dbmaker, mail_dir, "dual-role@example.org",
                     roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "role-student@example.org")
    active = active_class(admin, catalog["course"]["id"], [dual], code="ROLE-01-A")
    assert enroll(admin, active["id"], student).status_code == 201

    as_instructor = signed_in("dual-role@example.org", role="instructor")
    assert as_instructor.get(f"/api/v1/instructor/cohorts").status_code == 200
    assert as_instructor.get(f"/api/v1/me/enrollments").status_code == 403

    as_student = signed_in("dual-role@example.org", role="student")
    assert as_student.get("/api/v1/instructor/cohorts").status_code == 403
    assert as_student.get("/api/v1/me/enrollments").status_code == 200
    # Assigned Instructor role with Student active: no lesson body without enrollment.
    assert as_student.get(f"/api/v1/lessons/{catalog['lesson']['id']}").status_code == 403

    plain_student = signed_in("role-student@example.org", role="student")
    assert plain_student.get("/api/v1/admin/cohorts").status_code == 403
    assert plain_student.get(f"/api/v1/admin/cohorts/{active['id']}").status_code == 403

    with TestClient(app) as anonymous:
        anonymous.headers.update(ORIGIN)
        for path in ("/api/v1/admin/cohorts", "/api/v1/instructor/cohorts",
                     "/api/v1/me/enrollments", f"/api/v1/lessons/{catalog['lesson']['id']}"):
            assert anonymous.get(path).status_code == 401


def test_student_enrollment_reads_expose_only_own_records(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="OWN-01", title="Own records course")
    instructor = make_user(admin, dbmaker, mail_dir, "own-teacher@example.org",
                           roles=("instructor",))
    first = make_user(admin, dbmaker, mail_dir, "own-first@example.org")
    second = make_user(admin, dbmaker, mail_dir, "own-second@example.org")
    active = active_class(admin, catalog["course"]["id"], [instructor], code="OWN-01-A")
    mine = enroll(admin, active["id"], first).json()
    assert enroll(admin, active["id"], second).status_code == 201

    client_first = signed_in("own-first@example.org", role="student")
    listing = client_first.get("/api/v1/me/enrollments").json()
    assert listing["total"] == 1
    assert listing["items"][0]["id"] == mine["id"]
    assert "email" not in json.dumps(listing["items"][0])

    detail = client_first.get(f"/api/v1/me/enrollments/{mine['id']}/course")
    assert detail.status_code == 200
    assert detail.json()["cohort"]["id"] == active["id"]
    assert detail.json()["course"]["code"] == "OWN-01"

    with dbmaker() as db:
        other = db.query(CohortEnrollment).filter_by(student_user_id=second).one().id
    assert client_first.get(f"/api/v1/me/enrollments/{other}/course").status_code == 404


def test_cohort_privileges_require_origin_role_and_step_up(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="GUARD-01", title="Guard course")
    cohort = make_cohort(admin, catalog["course"]["id"])
    instructor = make_user(admin, dbmaker, mail_dir, "guard-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "guard-student@example.org")

    assert admin.post("/api/v1/admin/cohorts", headers={"Origin": "https://evil.example"},
                      json={"course_id": catalog["course"]["id"], "code": "BAD-1",
                            "name": "Rejected"}).status_code == 403

    student_client = signed_in("guard-student@example.org", role="student")
    instructor_client = signed_in("guard-teacher@example.org", role="instructor")
    for client_under_test in (student_client, instructor_client):
        assert client_under_test.post("/api/v1/admin/cohorts", json={
            "course_id": catalog["course"]["id"], "code": "NOPE-1",
            "name": "Nope"}).status_code == 403
        assert client_under_test.post(
            f"/api/v1/admin/cohorts/{cohort['id']}/activate").status_code == 403

    # Manager role works too, and a stale step-up blocks only the mutations.
    manager = make_user(admin, dbmaker, mail_dir, "guard-manager@example.org",
                        roles=("manager",))
    manager_client = signed_in("guard-manager@example.org", role="manager")
    assert manager_client.get("/api/v1/admin/cohorts").status_code == 200
    assert manager_client.post(f"/api/v1/admin/cohorts/{cohort['id']}/instructors",
                               json={"instructor_user_id": instructor}).status_code == 201

    token = manager_client.cookies.get("cyberlab_session")
    with dbmaker() as db:
        record = db.query(Session).filter_by(token_digest=digest_token(token)).one()
        stale = now() - timedelta(minutes=15)
        record.authenticated_at = stale
        record.mfa_verified_at = stale
        db.commit()
    assert manager_client.get("/api/v1/admin/cohorts").status_code == 200
    assert manager_client.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate").status_code == 403
    assert manager_client.post("/api/v1/admin/cohorts", json={
        "course_id": catalog["course"]["id"], "code": "STALE-1",
        "name": "Stale"}).status_code == 403
    assert manager != student


def test_administrative_enrollments_carry_the_student_name(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    catalog = published_catalog(admin, code="NAME-01", title="Named roster course")
    instructor = make_user(admin, dbmaker, mail_dir, "name-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "name-student@example.org")
    active = active_class(admin, catalog["course"]["id"], [instructor], code="NAME-01-A")

    created = enroll(admin, active["id"], student)
    assert created.status_code == 201
    assert created.json()["student_full_name"] == "Synthetic Learner"
    enrollment_id = created.json()["id"]

    # A fresh request re-reads the name from users instead of trusting anything the caller sent.
    reloaded = admin.get(f"/api/v1/admin/cohorts/{active['id']}/enrollments")
    assert reloaded.status_code == 200
    assert reloaded.json()["items"][0]["student_full_name"] == "Synthetic Learner"
    assert set(reloaded.json()["items"][0]) == {
        "id", "cohort_id", "course_id", "student_user_id", "student_full_name", "status",
        "enrolled_at", "ended_at"}

    withdrawn = admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                            json={"status": "withdrawn"})
    assert withdrawn.status_code == 200
    assert withdrawn.json()["student_full_name"] == "Synthetic Learner"
    reactivated = admin.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                              json={"status": "active"})
    assert reactivated.json()["student_full_name"] == "Synthetic Learner"

    # Renaming the account is reflected on the next roster read.
    student_client = signed_in("name-student@example.org", role="student")
    renamed = student_client.patch("/api/v1/users/me", json={"full_name": "Renamed Learner"})
    assert renamed.status_code == 200
    assert admin.get(f"/api/v1/admin/cohorts/{active['id']}/enrollments").json()[
        "items"][0]["student_full_name"] == "Renamed Learner"

    # The name is server-derived: a client cannot supply it.
    forged = admin.post(f"/api/v1/admin/cohorts/{active['id']}/enrollments",
                        json={"student_user_id": student, "student_full_name": "Impostor"})
    assert forged.status_code == 422

    # Students never reach the administrative roster, and their own schema is unchanged.
    assert student_client.get(
        f"/api/v1/admin/cohorts/{active['id']}/enrollments").status_code == 403
    assert student_client.patch(f"/api/v1/admin/enrollments/{enrollment_id}",
                                json={"status": "withdrawn"}).status_code == 403
    own = student_client.get("/api/v1/me/enrollments").json()
    assert own["total"] == 1
    assert "student_full_name" not in own["items"][0]
    assert "email" not in json.dumps(own["items"][0])


def test_openapi_contract_matches_and_stays_additive():
    committed = json.loads(CONTRACT.read_text())
    assert committed == app.openapi()
    assert committed["info"]["version"] == "0.4.0"
    expected = {
        "/api/v1/admin/cohorts", "/api/v1/admin/cohorts/{cohort_id}",
        "/api/v1/admin/cohorts/{cohort_id}/activate",
        "/api/v1/admin/cohorts/{cohort_id}/complete",
        "/api/v1/admin/cohorts/{cohort_id}/archive",
        "/api/v1/admin/cohorts/{cohort_id}/instructors",
        "/api/v1/admin/cohorts/{cohort_id}/instructors/{user_id}",
        "/api/v1/admin/cohorts/{cohort_id}/enrollments",
        "/api/v1/admin/enrollments/{enrollment_id}",
        "/api/v1/instructor/cohorts", "/api/v1/instructor/cohorts/{cohort_id}",
        "/api/v1/instructor/cohorts/{cohort_id}/students",
        "/api/v1/me/enrollments", "/api/v1/me/enrollments/{enrollment_id}/course",
    }
    assert expected <= set(committed["paths"])
    lesson = committed["paths"]["/api/v1/lessons/{lesson_id}"]["get"]
    ref = lesson["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("/LessonDetail")
    roster = committed["paths"]["/api/v1/instructor/cohorts/{cohort_id}/students"]["get"]
    assert roster["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"].endswith("/PageRoster")
