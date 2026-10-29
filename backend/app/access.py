"""Server-side relationship checks for teaching and learning access.

Every rule here answers "does *this* session hold a live relationship to *this* resource",
resolved from the database on each request. Nothing is cached, so withdrawing an enrollment,
removing an instructor, completing a class, deactivating an account or revoking a role takes
effect on the next request.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext
from .models import (CohortEnrollment, CohortInstructor, CohortStatus, ContentStatus, Course,
                     CourseCohort, CourseModule, ModuleLesson, Role)

PUBLISHED = ContentStatus.published.value
ACTIVE_COHORT = CohortStatus.active.value
ACTIVE_ENROLLMENT = "active"
DENIED = ("Only published lessons of a published course and module are readable, and only with "
          "a current enrollment or teaching assignment for that course")


def lesson_ancestors(db: DbSession, lesson: ModuleLesson) -> tuple[CourseModule | None, Course | None]:
    module = db.get(CourseModule, lesson.module_id)
    course = db.get(Course, module.course_id) if module else None
    return module, course


def lesson_is_published(db: DbSession, lesson: ModuleLesson) -> bool:
    module, course = lesson_ancestors(db, lesson)
    if module is None or course is None:
        return False
    return (course.status == PUBLISHED and module.status == PUBLISHED
            and lesson.status == PUBLISHED)


def active_student_in_course(db: DbSession, user_id: str, course_id: str) -> bool:
    return db.scalar(
        select(CohortEnrollment.id)
        .join(CourseCohort, CourseCohort.id == CohortEnrollment.cohort_id)
        .where(CohortEnrollment.student_user_id == user_id,
               CohortEnrollment.status == ACTIVE_ENROLLMENT,
               CourseCohort.status == ACTIVE_COHORT,
               CourseCohort.course_id == course_id)
        .limit(1)
    ) is not None


def active_instructor_in_course(db: DbSession, user_id: str, course_id: str) -> bool:
    return db.scalar(
        select(CohortInstructor.id)
        .join(CourseCohort, CourseCohort.id == CohortInstructor.cohort_id)
        .where(CohortInstructor.instructor_user_id == user_id,
               CohortInstructor.removed_at.is_(None),
               CourseCohort.status == ACTIVE_COHORT,
               CourseCohort.course_id == course_id)
        .limit(1)
    ) is not None


def holds_assignment(db: DbSession, user_id: str, cohort_id: str) -> bool:
    """Live teaching assignment, used by the instructor endpoints."""
    return db.scalar(
        select(CohortInstructor.id).where(
            CohortInstructor.cohort_id == cohort_id,
            CohortInstructor.instructor_user_id == user_id,
            CohortInstructor.removed_at.is_(None)).limit(1)
    ) is not None


def can_read_lesson_body(db: DbSession, context: AuthContext, lesson: ModuleLesson) -> bool:
    """Content managers preview drafts; learners and teachers need a live relationship."""
    if context.session.active_role in {Role.manager, Role.administrator}:
        return True
    if not lesson_is_published(db, lesson):
        return False
    module, course = lesson_ancestors(db, lesson)
    if module is None or course is None:
        return False
    if context.session.active_role == Role.student:
        if not context.user.email_verified or not context.user.is_active:
            return False
        return active_student_in_course(db, context.user.id, course.id)
    if context.session.active_role == Role.instructor:
        return active_instructor_in_course(db, context.user.id, course.id)
    return False
