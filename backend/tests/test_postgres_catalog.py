"""PostgreSQL-only catalog checks: migration round trip, sequence race, seed idempotency.

Uses the throwaway-database fixture from the Milestone 01D PostgreSQL suite.
"""
from concurrent.futures import ThreadPoolExecutor

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select

from app.main import app
from app.models import Course, CourseModule
from app.seed_catalog import seed_ceh_v12
from test_milestone_01b import ORIGIN, admin_ready
from test_postgres_integration import postgres_client  # noqa: F401  (pytest fixture)

CATALOG_TABLES = {"courses", "course_modules", "module_lessons", "lesson_objectives",
                  "learning_resources"}


def test_postgres_catalog_migration_upgrade_and_downgrade(postgres_client):
    _, dbmaker, engine = postgres_client
    configuration = Config("alembic.ini")

    command.downgrade(configuration, "0002_account_security")
    remaining = set(inspect(engine).get_table_names())
    assert not (CATALOG_TABLES & remaining)
    assert {"users", "sessions", "audit_events"}.issubset(remaining)

    command.upgrade(configuration, "head")
    assert CATALOG_TABLES.issubset(set(inspect(engine).get_table_names()))
    # Account data is untouched by the catalog migration.
    assert {"users", "user_roles", "sessions", "one_time_tokens", "mfa_enrollments",
            "audit_events", "rate_limit_events"}.issubset(set(inspect(engine).get_table_names()))


def test_postgres_concurrent_module_sequence_keeps_uniqueness(postgres_client):
    first, dbmaker, engine = postgres_client
    admin_ready(first, dbmaker)
    created = first.post("/api/v1/admin/courses", json={
        "code": "RACE-01", "title": "Concurrent sequence course", "edition": "v1",
        "planned_module_count": 20})
    assert created.status_code == 201, created.text
    course_id = created.json()["id"]

    with TestClient(app) as second:
        second.headers.update(ORIGIN)
        second.cookies.set("cyberlab_session", first.cookies.get("cyberlab_session"))

        def create(client, title):
            return client.post(f"/api/v1/admin/courses/{course_id}/modules",
                               json={"sequence": 1, "title": title}).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(create, first, "First concurrent module"),
                       executor.submit(create, second, "Second concurrent module")]
            statuses = sorted(future.result() for future in futures)

    assert statuses == [201, 409]
    with dbmaker() as db:
        modules = db.scalars(select(CourseModule).where(
            CourseModule.course_id == course_id)).all()
        assert len(modules) == 1


def test_postgres_seed_is_idempotent(postgres_client):
    _, dbmaker, _ = postgres_client
    with dbmaker() as db:
        assert seed_ceh_v12(db).course_created is True
    with dbmaker() as db:
        assert seed_ceh_v12(db).course_created is False
    with dbmaker() as db:
        courses = db.scalars(select(Course).where(Course.code == "CEH-V12")).all()
        assert len(courses) == 1
        assert courses[0].planned_module_count == 20
        modules = db.scalars(select(CourseModule).where(
            CourseModule.course_id == courses[0].id)).all()
        assert len(modules) == 1


def test_postgres_progress_migration_round_trip(postgres_client):
    """0005 adds evidence without touching 02A/02B tables, and its downgrade is clean."""
    _, dbmaker, engine = postgres_client
    configuration = Config("alembic.ini")
    command.downgrade(configuration, "0004_cohorts_enrollment")
    remaining = set(inspect(engine).get_table_names())
    assert "lesson_completion_events" not in remaining
    assert {"courses", "course_cohorts", "cohort_enrollments"}.issubset(remaining)

    command.upgrade(configuration, "head")
    tables = set(inspect(engine).get_table_names())
    assert "lesson_completion_events" in tables
    assert {"courses", "course_modules", "module_lessons", "cohort_instructors",
            "cohort_enrollments", "users", "sessions"}.issubset(tables)
