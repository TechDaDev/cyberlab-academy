"""Academic catalog (Milestone 02A): content lifecycle, visibility, RBAC and contract.

Focused development checks. Independent verification is Codex's responsibility.
"""
import json
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import AuditEvent, Course, CourseModule, ModuleLesson, Role, Session, User
from app.security import digest_token, now
from app.seed_catalog import CEH_V12_PLANNED_MODULES, seed_ceh_v12
from test_milestone_01b import (ORIGIN, PASSWORD, admin_ready, login, register,
                                verify_email)

CONTRACT = Path(__file__).resolve().parent.parent.parent / "shared-contracts" / "openapi.json"
LESSON_BODY = "# Reviewed body\n\nOriginal authored text for a focused test."


def user_id(dbmaker, email: str) -> str:
    with dbmaker() as db:
        return db.query(User).filter_by(email=email).one().id


def make_manager(admin_client, dbmaker, mail_dir, email="catalog-manager@example.org"):
    """Register a user, have the administrator grant Manager, then activate it."""
    assert register(admin_client, email).status_code == 202
    assert verify_email(admin_client, mail_dir).status_code == 200
    target = user_id(dbmaker, email)
    granted = admin_client.post(f"/api/v1/admin/users/{target}/roles",
                                json={"role": "manager", "reason": "Catalog authoring"})
    assert granted.status_code == 200, granted.text
    client = TestClient(app)
    client.headers.update(ORIGIN)
    assert login(client, email).status_code == 200
    assert client.post("/api/v1/auth/active-role", json={"role": "manager"}).status_code == 200
    return client


def make_student(admin_client, dbmaker, mail_dir, email="catalog-student@example.org",
                 instructor=False):
    assert register(admin_client, email, instructor=instructor).status_code == 202
    assert verify_email(admin_client, mail_dir).status_code == 200
    client = TestClient(app)
    client.headers.update(ORIGIN)
    assert login(client, email).status_code == 200
    return client


def create_course(admin, code="CEH-V12", planned=20, title="Certified Ethical Hacker v12"):
    response = admin.post("/api/v1/admin/courses", json={
        "code": code, "title": title, "edition": "v12",
        "planned_module_count": planned, "summary": "Synthetic catalog course",
    })
    assert response.status_code == 201, response.text
    return response.json()


def create_module(admin, course_id, sequence=1, title="Introduction to Ethical Hacking"):
    response = admin.post(f"/api/v1/admin/courses/{course_id}/modules",
                          json={"sequence": sequence, "title": title, "summary": ""})
    assert response.status_code == 201, response.text
    return response.json()


def create_lesson(admin, module_id, sequence=1, title="Orientation", body=LESSON_BODY):
    response = admin.post(f"/api/v1/admin/modules/{module_id}/lessons", json={
        "sequence": sequence, "title": title, "body_markdown": body,
        "objectives": ["Explain the module scope", "Describe authorized testing limits"],
        "resources": [{"title": "Public framework reference", "type": "reference",
                       "external_url": "https://example.org/framework"}],
    })
    assert response.status_code == 201, response.text
    return response.json()


def publish(admin, path):
    return admin.post(f"/api/v1{path}")


def test_course_creation_is_privileged_and_starts_as_a_draft(client):
    admin, dbmaker = client
    admin_id = admin_ready(admin, dbmaker)

    course = create_course(admin)
    assert course["status"] == "draft"
    assert course["planned_module_count"] == CEH_V12_PLANNED_MODULES
    assert course["published_module_count"] == 0
    assert course["content_version"] == 1
    assert course["published_at"] is None
    with dbmaker() as db:
        stored = db.scalar(select(Course).where(Course.code == "CEH-V12"))
        assert stored.created_by == admin_id
        audit = db.scalar(select(AuditEvent).where(
            AuditEvent.action == "catalog.course_created", AuditEvent.subject_id == stored.id))
        assert audit is not None and audit.actor_id == admin_id

    duplicate = admin.post("/api/v1/admin/courses", json={
        "code": "CEH-V12", "title": "Duplicate code", "edition": "v12",
        "planned_module_count": 20,
    })
    assert duplicate.status_code == 409


def test_course_input_is_validated_and_read_endpoints_are_authenticated(client):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)

    bad_code = admin.post("/api/v1/admin/courses", json={
        "code": "ceh v12", "title": "Lowercase code", "edition": "v12",
        "planned_module_count": 20})
    assert bad_code.status_code == 422
    unknown_field = admin.post("/api/v1/admin/courses", json={
        "code": "CEH-V12", "title": "Smuggled status", "edition": "v12",
        "planned_module_count": 20, "status": "published"})
    assert unknown_field.status_code == 422
    zero_plan = admin.post("/api/v1/admin/courses", json={
        "code": "CEH-V12", "title": "Zero plan", "edition": "v12", "planned_module_count": 0})
    assert zero_plan.status_code == 422

    with TestClient(app) as anonymous:
        anonymous.headers.update(ORIGIN)
        assert anonymous.get("/api/v1/courses").status_code == 401
        assert anonymous.get("/api/v1/admin/courses").status_code == 401


def test_module_sequence_is_unique_and_bounded_by_the_planned_count(client):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    course = create_course(admin)

    module = create_module(admin, course["id"], sequence=1)
    assert module["status"] == "draft"
    assert module["course_id"] == course["id"]

    duplicate = admin.post(f"/api/v1/admin/courses/{course['id']}/modules",
                           json={"sequence": 1, "title": "Duplicate sequence"})
    assert duplicate.status_code == 409

    beyond_plan = admin.post(f"/api/v1/admin/courses/{course['id']}/modules",
                             json={"sequence": 21, "title": "Beyond the plan"})
    assert beyond_plan.status_code == 422
    assert "planned_module_count" in beyond_plan.json()["detail"]

    twentieth = create_module(admin, course["id"], sequence=20, title="Reserved position")
    assert twentieth["sequence"] == 20

    conflict = admin.patch(f"/api/v1/admin/modules/{twentieth['id']}", json={"sequence": 1})
    assert conflict.status_code == 409

    shrink = admin.patch(f"/api/v1/admin/courses/{course['id']}",
                         json={"planned_module_count": 5})
    assert shrink.status_code == 409


def test_lesson_creation_stores_objectives_resources_and_bumps_content_version(client):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    course = create_course(admin)
    module = create_module(admin, course["id"])

    lesson = create_lesson(admin, module["id"])
    assert lesson["status"] == "draft"
    assert lesson["content_version"] == 1
    assert lesson["body_markdown"] == LESSON_BODY
    assert [item["text"] for item in lesson["objectives"]] == [
        "Explain the module scope", "Describe authorized testing limits"]
    assert lesson["resources"][0]["type"] == "reference"
    assert lesson["resources"][0]["external_url"] == "https://example.org/framework"

    duplicate = admin.post(f"/api/v1/admin/modules/{module['id']}/lessons",
                           json={"sequence": 1, "title": "Duplicate lesson"})
    assert duplicate.status_code == 409

    edited = admin.patch(f"/api/v1/admin/lessons/{lesson['id']}", json={"title": "Renamed"})
    assert edited.status_code == 200
    assert edited.json()["content_version"] == 2
    assert edited.json()["objectives"][0]["sequence"] == 1

    unsafe = admin.patch(f"/api/v1/admin/lessons/{lesson['id']}", json={"resources": [
        {"title": "Absolute path attempt", "type": "download_reference",
         "asset_reference": "/etc/passwd"}]})
    assert unsafe.status_code == 422
    bad_scheme = admin.patch(f"/api/v1/admin/lessons/{lesson['id']}", json={"resources": [
        {"title": "Javascript scheme", "type": "external_link",
         "external_url": "javascript:alert(1)"}]})
    assert bad_scheme.status_code == 422


def test_students_cannot_see_drafts_and_published_catalog_is_visible(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin)
    module = create_module(admin, course["id"])
    lesson = create_lesson(admin, module["id"])
    student = make_student(admin, dbmaker, mail_dir)

    assert student.get("/api/v1/courses").json()["items"] == []
    assert student.get(f"/api/v1/courses/{course['id']}").status_code == 404
    assert student.get(f"/api/v1/courses/{course['id']}/modules").status_code == 404
    assert student.get(f"/api/v1/modules/{module['id']}").status_code == 404
    assert student.get(f"/api/v1/modules/{module['id']}/lessons").status_code == 404
    assert student.get("/api/v1/lessons/00000000-0000-0000-0000-000000000000").status_code == 404

    assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/lessons/{lesson['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/modules/{module['id']}/publish").status_code == 200

    listing = student.get("/api/v1/courses").json()
    assert listing["total"] == 1
    assert listing["items"][0]["published_module_count"] == 1
    detail = student.get(f"/api/v1/courses/{course['id']}").json()
    assert detail["status"] == "published"
    assert [item["sequence"] for item in
            student.get(f"/api/v1/courses/{course['id']}/modules").json()] == [1]
    summaries = student.get(f"/api/v1/modules/{module['id']}/lessons").json()
    assert [item["title"] for item in summaries] == ["Orientation"]
    assert "body_markdown" not in summaries[0]

    # Draft lesson inside a published module stays hidden from learners.
    second = create_lesson(admin, module["id"], sequence=2, title="Unpublished lesson")
    titles = [item["title"] for item in
              student.get(f"/api/v1/modules/{module['id']}/lessons").json()]
    assert titles == ["Orientation"]
    assert second["status"] == "draft"


def test_lesson_bodies_need_a_live_relationship_or_a_managing_role(client, tmp_path):
    """02A gated bodies to content managers; 02B adds enrollment/assignment-based access."""
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin)
    module = create_module(admin, course["id"])
    lesson = create_lesson(admin, module["id"])
    publish(admin, f"/admin/courses/{course['id']}/publish")
    publish(admin, f"/admin/lessons/{lesson['id']}/publish")

    student = make_student(admin, dbmaker, mail_dir)
    denied = student.get(f"/api/v1/lessons/{lesson['id']}")
    assert denied.status_code == 403
    assert "enrollment" in denied.json()["detail"]

    instructor = make_student(admin, dbmaker, mail_dir, email="catalog-instructor@example.org",
                              instructor=True)
    assert instructor.get(f"/api/v1/lessons/{lesson['id']}").status_code == 403

    manager = make_manager(admin, dbmaker, mail_dir)
    body = manager.get(f"/api/v1/lessons/{lesson['id']}")
    assert body.status_code == 200
    assert body.json()["body_markdown"] == LESSON_BODY
    assert body.headers["cache-control"] == "no-store"


def test_publishing_is_explicit_and_requires_valid_content(client):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    course = create_course(admin)
    module = create_module(admin, course["id"])

    empty_lesson = create_lesson(admin, module["id"], title="Empty lesson", body="   ")
    assert publish(admin, f"/admin/lessons/{empty_lesson['id']}/publish").status_code == 409

    orphan = create_module(admin, course["id"], sequence=2, title="Module without lessons")
    assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/modules/{orphan['id']}/publish").status_code == 409
    assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 409

    lesson = create_lesson(admin, module["id"], sequence=2, title="Reviewed lesson")
    assert publish(admin, f"/admin/lessons/{lesson['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/lessons/{lesson['id']}/publish").status_code == 409
    assert publish(admin, f"/admin/modules/{module['id']}/publish").status_code == 200
    assert publish(admin, f"/admin/modules/{module['id']}/publish").status_code == 409

    late_course = create_course(admin, code="FOUND-01", title="Foundation course")
    late_module = create_module(admin, late_course["id"])
    assert publish(admin, f"/admin/modules/{late_module['id']}/publish").status_code == 409


def test_catalog_mutations_require_origin_role_and_recent_step_up(client, tmp_path):
    admin, dbmaker = client
    admin_id = admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin)

    missing_origin = admin.post("/api/v1/admin/courses", headers={"Origin": "https://evil.example"},
                                json={"code": "EVIL-01", "title": "Rejected", "edition": "v1",
                                      "planned_module_count": 1})
    assert missing_origin.status_code == 403

    student = make_student(admin, dbmaker, mail_dir)
    assert student.get("/api/v1/admin/courses").status_code == 403
    assert student.post("/api/v1/admin/courses", json={
        "code": "STUD-01", "title": "Student attempt", "edition": "v1",
        "planned_module_count": 1}).status_code == 403
    assert student.post(f"/api/v1/admin/courses/{course['id']}/publish").status_code == 403

    instructor = make_student(admin, dbmaker, mail_dir, email="catalog-teach@example.org",
                              instructor=True)
    assert instructor.post(f"/api/v1/admin/courses/{course['id']}/publish").status_code == 403

    manager = make_manager(admin, dbmaker, mail_dir)
    assert manager.get("/api/v1/admin/courses").status_code == 200
    manager_course = create_course(manager, code="MGR-01", title="Manager authored course")
    assert manager_course["status"] == "draft"

    # Stale step-up blocks privileged writes but still allows the draft listing.
    token = manager.cookies.get("cyberlab_session")
    with dbmaker() as db:
        record = db.query(Session).filter_by(token_digest=digest_token(token)).one()
        stale = now() - timedelta(minutes=15)
        record.authenticated_at = stale
        record.mfa_verified_at = stale
        db.commit()
    assert manager.get("/api/v1/admin/courses").status_code == 200
    blocked = manager.patch(f"/api/v1/admin/courses/{manager_course['id']}",
                            json={"title": "Blocked rename"})
    assert blocked.status_code == 403
    assert admin_id != user_id(dbmaker, "catalog-manager@example.org")


def test_catalog_reads_are_attributed_and_paginated(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    for index in range(3):
        created = create_course(admin, code=f"CRS-{index}", title=f"Synthetic course {index}")
        assert publish(admin, f"/admin/courses/{created['id']}/publish").status_code == 200

    student = make_student(admin, dbmaker, mail_dir)
    page = student.get("/api/v1/courses", params={"limit": 2, "offset": 0}).json()
    assert page["limit"] == 2 and page["offset"] == 0 and page["total"] == 3
    assert len(page["items"]) == 2
    second = student.get("/api/v1/courses", params={"limit": 2, "offset": 2}).json()
    assert len(second["items"]) == 1
    assert student.get("/api/v1/courses", params={"limit": 500}).status_code == 422
    assert student.get("/api/v1/courses", params={"offset": -1}).status_code == 422


def test_seed_is_idempotent_and_never_invents_curriculum(client):
    _, dbmaker = client
    with dbmaker() as db:
        first = seed_ceh_v12(db)
    assert first.course_created is True
    assert first.modules_created == [1]

    with dbmaker() as db:
        second = seed_ceh_v12(db)
    assert second.course_created is False
    assert second.modules_created == []

    with dbmaker() as db:
        course = db.scalar(select(Course).where(Course.code == "CEH-V12"))
        assert course.planned_module_count == CEH_V12_PLANNED_MODULES == 20
        assert course.status == "draft"
        modules = db.scalars(select(CourseModule)
                             .where(CourseModule.course_id == course.id)
                             .order_by(CourseModule.sequence)).all()
        assert [(module.sequence, module.title) for module in modules] == [
            (1, "Introduction to Ethical Hacking")]
        assert db.scalars(select(ModuleLesson).where(
            ModuleLesson.module_id == modules[0].id)).all() == []
        assert db.scalars(select(Course).where(Course.code == "CEH-V12")).all() == [course]

    with dbmaker() as db:
        course_only = seed_ceh_v12(db, with_module_shells=False)
    assert course_only.modules_created == []


def test_content_managers_can_rediscover_draft_content(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin, code="DRAFT-01", title="Draft navigation course")
    first = create_module(admin, course["id"], sequence=3, title="Third positioned module")
    second = create_module(admin, course["id"], sequence=1, title="First positioned module")

    manager = make_manager(admin, dbmaker, mail_dir)
    # Same session, after a reload-style follow-up request.
    detail = manager.get(f"/api/v1/admin/courses/{course['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "draft"
    assert detail.json()["id"] == course["id"]
    assert detail.json()["published_module_count"] == 0

    modules = manager.get(f"/api/v1/admin/courses/{course['id']}/modules")
    assert modules.status_code == 200
    assert [(item["sequence"], item["status"]) for item in modules.json()] == [
        (1, "draft"), (3, "draft")]
    assert {item["id"] for item in modules.json()} == {first["id"], second["id"]}

    # A brand-new client with the same session cookie (application reload) sees them too.
    with TestClient(app) as reloaded:
        reloaded.headers.update(ORIGIN)
        reloaded.cookies.set("cyberlab_session", manager.cookies.get("cyberlab_session"))
        assert reloaded.get(f"/api/v1/admin/courses/{course['id']}").status_code == 200
        again = reloaded.get(f"/api/v1/admin/courses/{course['id']}/modules").json()
        assert [item["sequence"] for item in again] == [1, 3]

    # Administrator has the same access, including archived/published states.
    assert publish(admin, f"/admin/courses/{course['id']}/publish").status_code == 200
    published_view = admin.get(f"/api/v1/admin/courses/{course['id']}")
    assert published_view.status_code == 200
    assert published_view.json()["status"] == "published"
    assert len(admin.get(f"/api/v1/admin/courses/{course['id']}/modules").json()) == 2

    # Empty course yields an empty array, not an error.
    empty = create_course(admin, code="EMPTY-01", title="Course without modules")
    assert admin.get(f"/api/v1/admin/courses/{empty['id']}/modules").json() == []

    # Missing records are 404 for authorized callers too.
    missing = "/api/v1/admin/courses/00000000-0000-0000-0000-000000000000"
    assert manager.get(missing).status_code == 404
    assert manager.get(f"{missing}/modules").status_code == 404


def test_admin_draft_navigation_is_role_restricted(client, tmp_path):
    admin, dbmaker = client
    admin_ready(admin, dbmaker)
    mail_dir = tmp_path / "mail"
    course = create_course(admin, code="SECRET-01", title="Draft only course")
    create_module(admin, course["id"], sequence=1, title="Draft only module")
    paths = (f"/api/v1/admin/courses/{course['id']}",
             f"/api/v1/admin/courses/{course['id']}/modules")

    with TestClient(app) as anonymous:
        anonymous.headers.update(ORIGIN)
        for path in paths:
            assert anonymous.get(path).status_code == 401

    student = make_student(admin, dbmaker, mail_dir)
    instructor = make_student(admin, dbmaker, mail_dir, email="scope-instructor@example.org",
                              instructor=True)
    for client_under_test in (student, instructor):
        for path in paths:
            assert client_under_test.get(path).status_code == 403

    # Public catalog endpoints stay publication-filtered for those same roles.
    assert student.get(f"/api/v1/courses/{course['id']}").status_code == 404
    assert student.get(f"/api/v1/courses/{course['id']}/modules").status_code == 404
    assert student.get("/api/v1/courses").json()["items"] == []


def test_openapi_contract_matches_the_running_application():
    committed = json.loads(CONTRACT.read_text())
    assert committed == app.openapi()
    catalog_paths = {path for path in committed["paths"] if "/admin/courses" in path
                     or path in {"/api/v1/courses", "/api/v1/modules/{module_id}",
                                 "/api/v1/modules/{module_id}/lessons",
                                 "/api/v1/lessons/{lesson_id}"}
                     or path.startswith(("/api/v1/courses/", "/api/v1/admin/modules/",
                                         "/api/v1/admin/lessons/"))}
    assert len(catalog_paths) == 15
    assert committed["info"]["version"] == "0.4.0"
    admin_course = committed["paths"]["/api/v1/admin/courses/{course_id}"]
    assert set(admin_course) == {"get", "patch"}
    assert admin_course["get"]["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"].endswith("/CoursePublic")
    admin_modules = committed["paths"]["/api/v1/admin/courses/{course_id}/modules"]
    assert set(admin_modules) == {"get", "post"}
    assert admin_modules["get"]["responses"]["200"]["content"]["application/json"]["schema"][
        "type"] == "array"
    for path in catalog_paths:
        for operation in committed["paths"][path].values():
            assert operation["tags"][0] in {"Catalog", "Content management"}
