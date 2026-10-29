"""Milestone 02C: version-aware lesson completion and derived progress.

Focused development checks; independent integration QA belongs to Codex.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import AuditEvent, LessonCompletionEvent, ModuleLesson, Session, User
from app.security import digest_token, now
from test_milestone_01b import ORIGIN, PASSWORD, admin_ready, login
from test_milestone_02a_catalog import create_course, create_lesson, create_module, publish
from test_milestone_02b_cohorts import (active_class, enroll, make_cohort, make_user,
                                        signed_in, user_id)
from test_postgres_integration import postgres_client  # noqa: F401  (pytest fixture)

CONTRACT = Path(__file__).resolve().parent.parent.parent / "shared-contracts" / "openapi.json"


# ------------------------------------------------------------------------- fixtures

def course_with(admin, code, structure, publish_all=True):
    """``structure`` = [(module sequence, [lesson titles])]; returns ids for reuse."""
    course = create_course(admin, code=code, title=f"{code} course")
    modules = []
    for sequence, titles in structure:
        module = create_module(admin, course["id"], sequence=sequence,
                               title=f"{code} module {sequence}")
        lessons = [create_lesson(admin, module["id"], sequence=index, title=title)
                   for index, title in enumerate(titles, start=1)]
        modules.append({"module": module, "lessons": lessons})
    if publish_all:
        assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 200
        for entry in modules:
            for lesson in entry["lessons"]:
                assert publish(admin, f"/admin/lessons/{lesson['id']}/publish").status_code == 200
            assert publish(admin, f"/admin/modules/{entry['module']['id']}/publish").status_code == 200
    return {"course": course, "modules": modules}


def complete(client, enrollment_id, lesson_id):
    return client.put(f"/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion",
                      json={"completed": True})


def progress(client, enrollment_id):
    return client.get(f"/api/v1/me/enrollments/{enrollment_id}/progress")


def classroom(admin, dbmaker, mail_dir, code="PROG-01", structure=((1, ["Lesson A", "Lesson B"]),),
              student_email="progress-student@example.org"):
    """Published course, active class, one eligible instructor and one enrolled student."""
    content = course_with(admin, code, structure)
    instructor = make_user(admin, dbmaker, mail_dir, f"{code.lower()}-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, student_email)
    cohort = active_class(admin, content["course"]["id"], [instructor],
                          code=f"{code}-A")
    enrollment = enroll(admin, cohort["id"], student)
    assert enrollment.status_code == 201, enrollment.text
    return {"content": content, "cohort": cohort, "instructor": instructor,
            "student": student, "enrollment": enrollment.json()["id"]}


# --------------------------------------------------------------------- completion

def test_first_completion_records_server_version_and_time(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir)
    lesson = room["content"]["modules"][0]["lessons"][0]
    student = signed_in("progress-student@example.org", role="student")

    started = now()
    response = complete(student, room["enrollment"], lesson["id"])
    assert response.status_code == 201
    body = response.json()
    assert body["lesson_version"] == 1
    assert body["newly_recorded"] is True
    assert body["enrollment_id"] == room["enrollment"]
    completed_at = body["completed_at"]
    assert completed_at is not None and str(started)[:13] <= completed_at[:13]

    with dbmaker() as db:
        events = db.scalars(select(LessonCompletionEvent).where(
            LessonCompletionEvent.enrollment_id == room["enrollment"])).all()
        assert len(events) == 1
        assert events[0].lesson_version == 1
        audits = db.scalars(select(AuditEvent).where(
            AuditEvent.action == "progress.lesson_completed")).all()
        assert len(audits) == 1 and audits[0].actor_id == room["student"]


def test_repeated_completion_is_idempotent_and_keeps_the_original_timestamp(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir)
    lesson = room["content"]["modules"][0]["lessons"][0]
    student = signed_in("progress-student@example.org", role="student")

    first = complete(student, room["enrollment"], lesson["id"])
    assert first.status_code == 201
    repeat = complete(student, room["enrollment"], lesson["id"])
    assert repeat.status_code == 200
    assert repeat.json()["completed_at"] == first.json()["completed_at"]
    assert repeat.json()["newly_recorded"] is False

    with dbmaker() as db:
        assert db.query(LessonCompletionEvent).count() == 1
        assert db.query(AuditEvent).filter_by(action="progress.lesson_completed").count() == 1

    # The timestamp is also preserved when a fresh session reads it back.
    again = signed_in("progress-student@example.org", role="student")
    assert complete(again, room["enrollment"], lesson["id"]).json()["completed_at"] == \
        first.json()["completed_at"]


def test_concurrent_completion_creates_exactly_one_record(postgres_client, tmp_path):
    first, dbmaker, _ = postgres_client
    admin_ready(first, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(first, dbmaker, mail_dir, code="RACE-C")
    lesson = room["content"]["modules"][0]["lessons"][0]

    # Two independent sessions of the same student race on the same completion.
    session_a = signed_in("progress-student@example.org", role="student")
    session_b = signed_in("progress-student@example.org", role="student")

    def attempt(client):
        return complete(client, room["enrollment"], lesson["id"]).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(attempt, session_a), executor.submit(attempt, session_b)]
        statuses = sorted(future.result() for future in futures)

    assert statuses == [200, 201]
    with dbmaker() as db:
        assert db.scalars(select(LessonCompletionEvent).where(
            LessonCompletionEvent.enrollment_id == room["enrollment"])).all().__len__() == 1
        assert db.query(AuditEvent).filter_by(action="progress.lesson_completed").count() == 1


def test_completion_requires_ownership_role_origin_and_verified_email(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="OWN-C")
    lesson = room["content"]["modules"][0]["lessons"][0]
    other = make_user(admin, dbmaker, mail_dir, "progress-other@example.org")
    signed_in("progress-other@example.org", role="student")
    student = signed_in("progress-student@example.org", role="student")

    assert complete(student, "00000000-0000-0000-0000-000000000000", lesson["id"]).status_code == 404
    assert student.put(f"/api/v1/me/enrollments/{room['enrollment']}/lessons/{lesson['id']}"
                       f"/completion", json={"completed": True},
                       headers={"Origin": "https://evil.example"}).status_code == 403
    assert student.put(f"/api/v1/me/enrollments/{room['enrollment']}/lessons/{lesson['id']}"
                       f"/completion", json={"completed": "yes"}).status_code == 422
    assert student.put(f"/api/v1/me/enrollments/{room['enrollment']}/lessons/{lesson['id']}"
                       f"/completion", json={"completed": True, "score": 90}).status_code == 422
    assert student.put(f"/api/v1/me/enrollments/{room['enrollment']}/lessons/{lesson['id']}"
                       f"/completion", json={"completed": False}).status_code == 422
    assert student.put(f"/api/v1/me/enrollments/{room['enrollment']}/lessons/{lesson['id']}"
                       f"/completion", json={"completed": True, "lesson_version": 9}).status_code == 422

    # Role enforcement: no other role can complete on a student's behalf.
    manager = make_user(admin, dbmaker, mail_dir, "progress-manager@example.org",
                        roles=("manager",))
    manager_client = signed_in("progress-manager@example.org", role="manager")
    assert complete(manager_client, room["enrollment"], lesson["id"]).status_code == 403
    assert complete(admin, room["enrollment"], lesson["id"]).status_code == 403
    instructor_client = signed_in("own-c-teacher@example.org", role="instructor")
    assert complete(instructor_client, room["enrollment"], lesson["id"]).status_code == 403

    with TestClient(app) as anonymous:
        anonymous.headers.update(ORIGIN)
        assert complete(anonymous, room["enrollment"], lesson["id"]).status_code == 401

    # An unverified account cannot record progress even while enrolled.
    with dbmaker() as db:
        db.query(User).filter_by(email="progress-student@example.org").one().email_verified = False
        db.commit()
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 403
    assert other


def test_completion_rejects_wrong_class_course_and_unpublished_content(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="XCOURSE")
    other = course_with(admin, "XOTHER", ((1, ["Foreign lesson"]),))
    foreign_lesson = other["modules"][0]["lessons"][0]
    draft = create_lesson(admin, room["content"]["modules"][0]["module"]["id"],
                          sequence=50, title="Draft lesson")
    student = signed_in("progress-student@example.org", role="student")

    cross_course = complete(student, room["enrollment"], foreign_lesson["id"])
    assert cross_course.status_code == 403
    assert "course" in cross_course.json()["detail"]
    unpublished = complete(student, room["enrollment"], draft["id"])
    assert unpublished.status_code == 403

    # A second class of the same course is a separate progress scope.
    instructor = room["instructor"]
    second_cohort = active_class(admin, room["content"]["course"]["id"], [instructor],
                                 code="XCOURSE-B")
    assert enroll(admin, second_cohort["id"], room["student"]).status_code == 201
    lesson = room["content"]["modules"][0]["lessons"][0]
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 201
    second_enrollment = enrollment_for(admin, second_cohort["id"], room["student"])
    assert progress(student, second_enrollment).json()["completed_current_lessons"] == 0


def test_withdrawn_enrollment_and_inactive_class_block_completion(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="WITHDRAW")
    lesson = room["content"]["modules"][0]["lessons"][0]
    student = signed_in("progress-student@example.org", role="student")

    assert complete(student, room["enrollment"], lesson["id"]).status_code == 201
    admin.patch(f"/api/v1/admin/enrollments/{room['enrollment']}", json={"status": "withdrawn"})
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 403
    # Historical progress stays readable for the withdrawn learner.
    historical = progress(student, room["enrollment"])
    assert historical.status_code == 200
    assert historical.json()["enrollment_status"] == "withdrawn"
    assert historical.json()["completed_current_lessons"] == 1

    admin.patch(f"/api/v1/admin/enrollments/{room['enrollment']}", json={"status": "active"})
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 200
    assert admin.post(f"/api/v1/admin/cohorts/{room['cohort']['id']}/complete").status_code == 200
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 403
    assert progress(student, room["enrollment"]).status_code == 200


# ----------------------------------------------------------------------- versions

def test_content_version_bump_marks_completion_for_review(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="REVISE")
    lesson = room["content"]["modules"][0]["lessons"][0]
    student = signed_in("progress-student@example.org", role="student")

    first = complete(student, room["enrollment"], lesson["id"])
    assert first.status_code == 201
    original_at = first.json()["completed_at"]

    edited = admin.patch(f"/api/v1/admin/lessons/{lesson['id']}",
                         json={"body_markdown": "# Revised\n\nNew reviewed copy."})
    assert edited.status_code == 200 and edited.json()["content_version"] == 2

    stale = progress(student, room["enrollment"]).json()
    assert stale["completed_current_lessons"] == 0
    assert stale["needs_review_lessons"] == 1
    assert stale["percent_complete"] == 0.0
    entry = stale["lessons"][0]
    assert entry["status"] == "needs_review"
    assert entry["completed_at"] is None
    assert entry["last_completed_version"] == 1
    assert entry["lesson_version"] == 2

    second = complete(student, room["enrollment"], lesson["id"])
    assert second.status_code == 201
    assert second.json()["lesson_version"] == 2
    assert second.json()["completed_at"] != original_at
    current = progress(student, room["enrollment"]).json()
    assert current["completed_current_lessons"] == 1 and current["needs_review_lessons"] == 0
    assert current["lessons"][0]["completed_at"] is not None

    # Both events are preserved: history is never rewritten.
    with dbmaker() as db:
        versions = sorted(event.lesson_version for event in db.scalars(
            select(LessonCompletionEvent).where(
                LessonCompletionEvent.enrollment_id == room["enrollment"])).all())
        assert versions == [1, 2]


# ----------------------------------------------------------------------- progress

def test_module_and_course_progress_calculation(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="MATH",
                     structure=((1, ["Lesson A1", "Lesson A2"]), (2, ["Lesson B1"])))
    student = signed_in("progress-student@example.org", role="student")
    module_one = room["content"]["modules"][0]["lessons"]
    module_two = room["content"]["modules"][1]["lessons"]

    for lesson in module_one:
        assert complete(student, room["enrollment"], lesson["id"]).status_code == 201

    body = progress(student, room["enrollment"]).json()
    assert body["total_published_lessons"] == 3
    assert body["completed_current_lessons"] == 2
    assert body["needs_review_lessons"] == 0
    assert body["percent_complete"] == 66.7
    assert body["is_complete"] is False
    assert [(m["sequence"], m["published_lesson_count"], m["completed_current_lessons"],
             m["percent_complete"]) for m in body["modules"]] == [(1, 2, 2, 100.0), (2, 1, 0, 0.0)]
    assert [entry["status"] for entry in body["lessons"]] == ["current", "current", "not_started"]
    assert "body_markdown" not in json.dumps(body)

    assert complete(student, room["enrollment"], module_two[0]["id"]).status_code == 201
    finished = progress(student, room["enrollment"]).json()
    assert finished["percent_complete"] == 100.0 and finished["is_complete"] is True


def test_newly_published_lesson_grows_the_denominator(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="GROW",
                     structure=((1, ["Only lesson"]),))
    module_id = room["content"]["modules"][0]["module"]["id"]
    student = signed_in("progress-student@example.org", role="student")
    first_lesson = room["content"]["modules"][0]["lessons"][0]
    assert complete(student, room["enrollment"], first_lesson["id"]).status_code == 201
    assert progress(student, room["enrollment"]).json()["percent_complete"] == 100.0

    extra = create_lesson(admin, module_id, sequence=2, title="Later lesson")
    assert publish(admin, f"/admin/lessons/{extra['id']}/publish").status_code == 200
    grown = progress(student, room["enrollment"]).json()
    assert grown["total_published_lessons"] == 2
    assert grown["completed_current_lessons"] == 1
    assert grown["percent_complete"] == 50.0 and grown["is_complete"] is False


def test_published_course_without_lessons_reports_zero_progress(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    # A published course whose only module has no lessons cannot be activated, so the class
    # stays draft and the student is enrolled only after the lesson appears.
    empty = course_with(admin, "EMPTY-C", ((1, []),), publish_all=False)
    assert publish(admin, f"/admin/courses/{empty['course']['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/modules/{empty['modules'][0]['module']['id']}/publish"
                   ).status_code == 409  # a module needs a published lesson
    instructor = make_user(admin, dbmaker, mail_dir, "empty-c-teacher@example.org",
                           roles=("instructor",))
    student = make_user(admin, dbmaker, mail_dir, "progress-student@example.org")
    cohort = make_cohort(admin, empty["course"]["id"], code="EMPTY-C-A")
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/instructors",
                      json={"instructor_user_id": instructor}).status_code == 201
    assert admin.post(f"/api/v1/admin/cohorts/{cohort['id']}/activate").status_code == 200
    enrollment = enroll(admin, cohort["id"], student).json()["id"]

    body = progress(signed_in("progress-student@example.org", role="student"), enrollment).json()
    assert body["total_published_lessons"] == 0
    assert body["completed_current_lessons"] == 0
    assert body["percent_complete"] == 0.0
    assert body["is_complete"] is False
    assert body["modules"] == [] and body["lessons"] == []
    assert student


def test_student_cannot_read_another_students_progress(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="PRIV")
    make_user(admin, dbmaker, mail_dir, "progress-other@example.org")
    other_client = signed_in("progress-other@example.org", role="student")
    student = signed_in("progress-student@example.org", role="student")

    assert progress(other_client, room["enrollment"]).status_code == 404
    instructor_client = signed_in("priv-teacher@example.org", role="instructor")
    assert progress(instructor_client, room["enrollment"]).status_code == 403
    assert progress(admin, room["enrollment"]).status_code == 403
    assert progress(student, room["enrollment"]).status_code == 200
    with TestClient(app) as anonymous:
        anonymous.headers.update(ORIGIN)
        assert progress(anonymous, room["enrollment"]).status_code == 401
    assert user_id(dbmaker, "progress-other@example.org")


# -------------------------------------------------------------------- class views

def test_instructor_class_progress_is_scoped_to_assigned_classes(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="TEACHP")
    lesson = room["content"]["modules"][0]["lessons"][0]
    other_teacher = make_user(admin, dbmaker, mail_dir, "teachp-other@example.org",
                              roles=("instructor",))
    other_course = course_with(admin, "TEACHP-OTHER", ((1, ["Other course lesson"]),))
    class_b = active_class(admin, other_course["course"]["id"], [other_teacher], code="TEACHP-B")

    student = signed_in("progress-student@example.org", role="student")
    assert complete(student, room["enrollment"], lesson["id"]).status_code == 201

    teacher = signed_in("teachp-teacher@example.org", role="instructor")
    body = teacher.get(f"/api/v1/instructor/cohorts/{room['cohort']['id']}/progress")
    assert body.status_code == 200
    payload = body.json()
    assert payload["cohort_id"] == room["cohort"]["id"]
    assert payload["total_published_lessons"] == 2
    assert payload["total_active_enrollments"] == 1
    row = payload["students"]["items"][0]
    assert row["student_full_name"] == "Synthetic Learner"
    assert row["completed_current_lessons"] == 1 and row["percent_complete"] == 50.0
    assert payload["average_percent_complete"] == 50.0
    assert body.headers["cache-control"] == "no-store"

    # Another class is invisible, and an Instructor can never write completion evidence.
    assert teacher.get(f"/api/v1/instructor/cohorts/{class_b['id']}/progress").status_code == 404
    assert complete(teacher, room["enrollment"], lesson["id"]).status_code == 403
    assert teacher.get(f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress").status_code == 403

    assert admin.delete(
        f"/api/v1/admin/cohorts/{room['cohort']['id']}/instructors/{room['instructor']}"
    ).status_code == 204
    assert teacher.get(
        f"/api/v1/instructor/cohorts/{room['cohort']['id']}/progress").status_code == 404


def test_admin_class_progress_aggregates_the_whole_class(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    room = classroom(admin, dbmaker, mail_dir, code="AGG",
                     structure=((1, ["Lesson A1", "Lesson A2"]),))
    lessons = room["content"]["modules"][0]["lessons"]
    second = make_user(admin, dbmaker, mail_dir, "agg-second@example.org")
    third = make_user(admin, dbmaker, mail_dir, "agg-third@example.org")
    assert enroll(admin, room["cohort"]["id"], second).status_code == 201
    assert enroll(admin, room["cohort"]["id"], third).status_code == 201

    first_client = signed_in("progress-student@example.org", role="student")
    second_client = signed_in("agg-second@example.org", role="student")
    for lesson in lessons:  # first student: 2/2
        assert complete(first_client, room["enrollment"], lesson["id"]).status_code == 201
    second_enrollment = enrollment_for(admin, room["cohort"]["id"], second)
    assert complete(second_client, second_enrollment, lessons[0]["id"]).status_code == 201

    manager = make_user(admin, dbmaker, mail_dir, "agg-manager@example.org", roles=("manager",))
    manager_client = signed_in("agg-manager@example.org", role="manager")

    # A stale step-up must not block read-only reporting.
    token = manager_client.cookies.get("cyberlab_session")
    with dbmaker() as db:
        record = db.query(Session).filter_by(token_digest=digest_token(token)).one()
        stale = now() - timedelta(minutes=30)
        record.authenticated_at = stale
        record.mfa_verified_at = stale
        db.commit()

    page = manager_client.get(f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress",
                              params={"limit": 1, "offset": 0})
    assert page.status_code == 200
    payload = page.json()
    assert payload["total_active_enrollments"] == 3
    assert payload["total_visible_enrollments"] == 3
    assert len(payload["students"]["items"]) == 1
    assert payload["students"]["total"] == 3
    # The class average covers all three students (100 + 50 + 0) / 3, not just the page.
    assert payload["average_percent_complete"] == 50.0

    full = manager_client.get(f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress",
                              params={"limit": 100}).json()
    by_student = {row["student_user_id"]: row["completed_current_lessons"]
                  for row in full["students"]["items"]}
    assert by_student[room["student"]] == 2
    assert by_student[second] == 1
    assert by_student[third] == 0

    # Withdrawn students stay visible historically but leave the active average.
    admin.patch(f"/api/v1/admin/enrollments/{second_enrollment}", json={"status": "withdrawn"})
    after = manager_client.get(f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress").json()
    assert after["total_active_enrollments"] == 2
    assert after["total_visible_enrollments"] == 3
    assert after["average_percent_complete"] == 50.0  # (100 + 0) / 2
    withdrawn_row = next(row for row in after["students"]["items"]
                         if row["enrollment_status"] == "withdrawn")
    assert withdrawn_row["completed_current_lessons"] == 1

    student_client = signed_in("agg-third@example.org", role="student")
    assert student_client.get(
        f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress").status_code == 403
    instructor_client = signed_in("agg-teacher@example.org", role="instructor")
    assert instructor_client.get(
        f"/api/v1/admin/cohorts/{room['cohort']['id']}/progress").status_code == 403
    assert admin.get(
        "/api/v1/admin/cohorts/00000000-0000-0000-0000-000000000000/progress").status_code == 404
    assert manager and room


def enrollment_for(admin, cohort_id, student_user_id):
    rows = admin.get(f"/api/v1/admin/cohorts/{cohort_id}/enrollments").json()["items"]
    return next(row["id"] for row in rows if row["student_user_id"] == student_user_id)


def test_openapi_contract_matches_and_stays_additive():
    committed = json.loads(CONTRACT.read_text())
    assert committed == app.openapi()
    assert committed["info"]["version"] == "0.5.0"
    added = {
        "/api/v1/me/enrollments/{enrollment_id}/progress",
        "/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion",
        "/api/v1/instructor/cohorts/{cohort_id}/progress",
        "/api/v1/admin/cohorts/{cohort_id}/progress",
    }
    assert added <= set(committed["paths"])
    completion = committed["paths"][
        "/api/v1/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion"]["put"]
    assert set(completion["responses"]) >= {"200", "201"}
    assert completion["responses"]["201"]["content"]["application/json"]["schema"][
        "$ref"].endswith("/CompletionResponse")
