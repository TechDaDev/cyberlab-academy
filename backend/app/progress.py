"""Derived academic progress for enrollments and classes.

Progress is always computed from the database at request time: the denominator is the set of
currently published lessons of the enrollment's course, and the numerator counts immutable
evidence recorded against each lesson's *current* ``content_version``. Nothing is persisted as a
percentage, so publication edits, new lessons and content revisions change the result on the very
next request without a synchronisation job.

Completion is self-reported academic progress ("I reviewed this lesson"), never a score, grade or
assessment result.
"""
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .models import (CohortEnrollment, ContentStatus, Course, CourseCohort, CourseModule,
                     LessonCompletionEvent, ModuleLesson)

PUBLISHED = ContentStatus.published.value
NOT_STARTED = "not_started"
CURRENT = "current"
NEEDS_REVIEW = "needs_review"


def percent(completed: int, total: int) -> float:
    """One decimal place, and never a false 100% for an empty denominator."""
    if total <= 0:
        return 0.0
    return round(completed / total * 100, 1)


@dataclass
class PublishedLesson:
    module: CourseModule
    lesson: ModuleLesson


@dataclass
class LessonState:
    module: CourseModule
    lesson: ModuleLesson
    status: str
    completed_at: datetime | None
    last_completed_version: int | None


@dataclass
class ProgressTotals:
    total_published_lessons: int = 0
    completed_current_lessons: int = 0
    needs_review_lessons: int = 0
    modules: list[dict] = field(default_factory=list)
    lessons: list[LessonState] = field(default_factory=list)

    @property
    def percent_complete(self) -> float:
        return percent(self.completed_current_lessons, self.total_published_lessons)

    @property
    def is_complete(self) -> bool:
        return self.total_published_lessons > 0 and (
            self.completed_current_lessons == self.total_published_lessons)


def course_is_published(course: Course | None) -> bool:
    return course is not None and course.status == PUBLISHED


def published_curriculum(db: DbSession, course_id: str) -> list[PublishedLesson]:
    """Published lessons whose module and course are published, in curriculum order."""
    course = db.get(Course, course_id)
    if course is None or course.status != PUBLISHED:
        return []
    rows = db.execute(
        select(CourseModule, ModuleLesson)
        .join(ModuleLesson, ModuleLesson.module_id == CourseModule.id)
        .where(CourseModule.course_id == course_id,
               CourseModule.status == PUBLISHED,
               ModuleLesson.status == PUBLISHED)
        .order_by(CourseModule.sequence, ModuleLesson.sequence, ModuleLesson.id)).all()
    return [PublishedLesson(module=module, lesson=lesson) for module, lesson in rows]


def events_for_enrollments(db: DbSession, enrollment_ids: list[str]) -> dict[str, dict[str, list[LessonCompletionEvent]]]:
    """Map ``enrollment_id -> lesson_id -> events`` in one query (avoids per-lesson lookups)."""
    if not enrollment_ids:
        return {}
    grouped: dict[str, dict[str, list[LessonCompletionEvent]]] = {}
    rows = db.scalars(
        select(LessonCompletionEvent)
        .where(LessonCompletionEvent.enrollment_id.in_(enrollment_ids))
        .order_by(LessonCompletionEvent.completed_at, LessonCompletionEvent.id)).all()
    for event in rows:
        grouped.setdefault(event.enrollment_id, {}).setdefault(event.lesson_id, []).append(event)
    return grouped


def lesson_state(lesson: ModuleLesson, events: list[LessonCompletionEvent]) -> tuple[str, datetime | None, int | None]:
    current = next((event for event in events if event.lesson_version == lesson.content_version), None)
    if current is not None:
        return CURRENT, current.completed_at, current.lesson_version
    if events:
        return NEEDS_REVIEW, None, max(event.lesson_version for event in events)
    return NOT_STARTED, None, None


def build_progress(lessons: list[PublishedLesson],
                   events: dict[str, list[LessonCompletionEvent]]) -> ProgressTotals:
    totals = ProgressTotals()
    modules: dict[str, dict] = {}
    for entry in lessons:
        lesson_events = events.get(entry.lesson.id, [])
        status, completed_at, last_version = lesson_state(entry.lesson, lesson_events)
        totals.lessons.append(LessonState(module=entry.module, lesson=entry.lesson, status=status,
                                          completed_at=completed_at,
                                          last_completed_version=last_version))
        bucket = modules.setdefault(entry.module.id, {
            "module": entry.module, "published_lesson_count": 0,
            "completed_current_lessons": 0, "needs_review_lessons": 0})
        bucket["published_lesson_count"] += 1
        if status == CURRENT:
            bucket["completed_current_lessons"] += 1
            totals.completed_current_lessons += 1
        elif status == NEEDS_REVIEW:
            bucket["needs_review_lessons"] += 1
            totals.needs_review_lessons += 1
        totals.total_published_lessons += 1
    totals.modules = list(modules.values())
    return totals


def enrollment_progress(db: DbSession, enrollment: CohortEnrollment,
                        cohort: CourseCohort) -> ProgressTotals:
    lessons = published_curriculum(db, cohort.course_id)
    events = events_for_enrollments(db, [enrollment.id]).get(enrollment.id, {})
    return build_progress(lessons, events)


def enrollment_ids_for_cohort(db: DbSession, cohort_id: str) -> list[str]:
    return list(db.scalars(select(CohortEnrollment.id)
                           .where(CohortEnrollment.cohort_id == cohort_id)).all())
