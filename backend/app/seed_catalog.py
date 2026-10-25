"""Idempotent draft seed for the CEH v12 course. Run: python -m app.seed_catalog

Only metadata that is actually known is written: the course identity with
``planned_module_count=20`` and, when a confirmed title exists, a single draft Module 01
shell. The 19 modules whose source material has not been supplied are deliberately not
created, and no lesson, objective, resource or body text is invented. Re-running the command
never duplicates or rewrites records.
"""
import argparse
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .database import SessionLocal
from .models import ContentStatus, Course, CourseModule

CEH_V12_CODE = "CEH-V12"
CEH_V12_TITLE = "Certified Ethical Hacker v12"
CEH_V12_EDITION = "v12"
CEH_V12_PLANNED_MODULES = 20
CEH_V12_SUMMARY = ("Mission-based ethical hacking curriculum. Module content is added as "
                   "reviewed source material becomes available.")

# Only titles that have been explicitly confirmed. Module 01 is the sole supplied module.
CONFIRMED_MODULES: dict[int, str] = {
    1: "Introduction to Ethical Hacking",
}


@dataclass
class SeedResult:
    course_id: str
    course_created: bool
    modules_created: list[int]


def seed_ceh_v12(db: DbSession, *, with_module_shells: bool = True) -> SeedResult:
    course = db.scalar(select(Course).where(Course.code == CEH_V12_CODE))
    course_created = False
    if course is None:
        course = Course(code=CEH_V12_CODE, title=CEH_V12_TITLE, edition=CEH_V12_EDITION,
                        summary=CEH_V12_SUMMARY,
                        planned_module_count=CEH_V12_PLANNED_MODULES,
                        status=ContentStatus.draft.value, content_version=1)
        db.add(course)
        db.flush()
        course_created = True

    created: list[int] = []
    if with_module_shells:
        existing = {module.sequence for module in
                    db.scalars(select(CourseModule).where(CourseModule.course_id == course.id))}
        for sequence, title in sorted(CONFIRMED_MODULES.items()):
            if sequence in existing:
                continue
            db.add(CourseModule(course_id=course.id, sequence=sequence, title=title,
                                summary="", status=ContentStatus.draft.value))
            created.append(sequence)
    db.commit()
    return SeedResult(course_id=course.id, course_created=course_created, modules_created=created)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the CEH v12 draft course (idempotent)")
    parser.add_argument("--skip-module-shells", action="store_true",
                        help="Create only the course metadata, no draft module records")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = seed_ceh_v12(db, with_module_shells=not args.skip_module_shells)
    state = "created" if result.course_created else "already present"
    modules = ", ".join(str(item) for item in result.modules_created) or "none"
    print(f"{CEH_V12_CODE} {state} ({result.course_id}); draft modules created: {modules}")


if __name__ == "__main__":
    main()
