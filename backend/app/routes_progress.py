"""Student lesson completion and derived progress reads for students, instructors and admins.

Completion evidence is written only by the owning Student through their own enrollment; no
instructor, manager or administrator path can create or alter it. Progress reads are derived on
every request from published content plus that evidence.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext, authorize, get_auth_context
from .database import get_db
from .models import (AuditEvent, CohortEnrollment, CohortStatus, ContentStatus, Course,
                     CourseCohort, CourseModule, EnrollmentStatus, LessonCompletionEvent,
                     ModuleLesson, Role, User, utcnow)
from .progress import (build_progress, enrollment_progress, events_for_enrollments, percent,
                       published_curriculum)
from .routes_catalog import CONTENT_MANAGERS
from .routes_cohorts import get_cohort, instructor_cohort
from .schemas_progress import (ClassProgress, ClassStudentProgress, CompletionRequest,
                               CompletionResponse, CompletionState, EnrollmentProgress,
                               LessonProgressEntry, ModuleProgressEntry, PageClassStudentProgress)
from .security import require_origin

router = APIRouter(prefix="/api/v1")
ACTIVE_ENROLLMENT = EnrollmentStatus.active.value
ACTIVE_COHORT = CohortStatus.active.value

WITHDRAWN_DENIED = "This enrollment is not active"
INACTIVE_CLASS_DENIED = "Only an active class accepts new completion evidence"
NOT_YOUR_COURSE = "Lesson does not belong to this enrollment's course"
UNPUBLISHED_DENIED = "Only published lessons can be completed"


def own_enrollment(db: DbSession, context: AuthContext, enrollment_id: str) -> CohortEnrollment:
    """The caller's own enrollment; another student's id is reported as missing."""
    enrollment = db.scalar(select(CohortEnrollment).where(
        CohortEnrollment.id == enrollment_id,
        CohortEnrollment.student_user_id == context.user.id))
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return enrollment


def completion_response(event: LessonCompletionEvent, newly_recorded: bool) -> CompletionResponse:
    return CompletionResponse(enrollment_id=event.enrollment_id, lesson_id=event.lesson_id,
                              lesson_version=event.lesson_version,
                              completed_at=event.completed_at, newly_recorded=newly_recorded)


def existing_event(db: DbSession, enrollment_id: str, lesson_id: str,
                   version: int) -> LessonCompletionEvent | None:
    return db.scalar(select(LessonCompletionEvent).where(
        LessonCompletionEvent.enrollment_id == enrollment_id,
        LessonCompletionEvent.lesson_id == lesson_id,
        LessonCompletionEvent.lesson_version == version))


def require_published(db: DbSession, lesson: ModuleLesson) -> CourseModule:
    module = db.get(CourseModule, lesson.module_id)
    course = db.get(Course, module.course_id) if module else None
    if (module is None or course is None or course.status != ContentStatus.published.value
            or module.status != ContentStatus.published.value
            or lesson.status != ContentStatus.published.value):
        raise HTTPException(status_code=403, detail=UNPUBLISHED_DENIED)
    return module


@router.put("/me/enrollments/{enrollment_id}/lessons/{lesson_id}/completion",
            response_model=CompletionResponse, status_code=201,
            responses={200: {"model": CompletionResponse,
                             "description": "This version was already completed; original timestamp kept"}},
            tags=["Progress"])
def complete_lesson(enrollment_id: str, lesson_id: str, payload: CompletionRequest,
                    request: Request, response: Response,
                    context: AuthContext = Depends(get_auth_context),
                    db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, {Role.student})
    if not context.user.email_verified:
        raise HTTPException(status_code=403, detail="Verified email required")

    enrollment = own_enrollment(db, context, enrollment_id)
    cohort = db.get(CourseCohort, enrollment.cohort_id)
    if cohort is None:
        raise HTTPException(status_code=404, detail="Class not found")
    if enrollment.status != ACTIVE_ENROLLMENT:
        raise HTTPException(status_code=403, detail=WITHDRAWN_DENIED)
    if cohort.status != ACTIVE_COHORT:
        raise HTTPException(status_code=403, detail=INACTIVE_CLASS_DENIED)

    # Lock the lesson row on PostgreSQL so a concurrent content edit cannot move the version
    # between validation and the insert; SQLite simply ignores the hint.
    lesson = db.get(ModuleLesson, lesson_id, with_for_update=True)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    require_published(db, lesson)
    module = db.get(CourseModule, lesson.module_id)
    if module is None or module.course_id != cohort.course_id:
        raise HTTPException(status_code=403, detail=NOT_YOUR_COURSE)

    version = lesson.content_version
    recorded = existing_event(db, enrollment.id, lesson.id, version)
    if recorded is not None:
        response.status_code = 200
        return completion_response(recorded, False)

    event = LessonCompletionEvent(enrollment_id=enrollment.id, lesson_id=lesson.id,
                                  lesson_version=version, completed_at=utcnow())
    db.add(event)
    try:
        db.flush()
        db.add(AuditEvent(actor_id=context.user.id, subject_id=enrollment.cohort_id,
                          action="progress.lesson_completed",
                          detail=f"Lesson {lesson.id} v{version} completed"[:500]))
        db.commit()
    except IntegrityError:
        # A concurrent identical request won the unique constraint: that is success, not a fault.
        db.rollback()
        recorded = existing_event(db, enrollment.id, lesson.id, version)
        if recorded is None:
            raise HTTPException(status_code=409,
                                detail="Completion conflicted with a concurrent change") from None
        response.status_code = 200
        return completion_response(recorded, False)
    db.refresh(event)
    return completion_response(event, True)


def serialize_enrollment_progress(db: DbSession, enrollment: CohortEnrollment,
                                  cohort: CourseCohort) -> EnrollmentProgress:
    totals = enrollment_progress(db, enrollment, cohort)
    return EnrollmentProgress(
        enrollment_id=enrollment.id, course_id=cohort.course_id, cohort_id=cohort.id,
        cohort_status=CohortStatus(cohort.status),
        enrollment_status=EnrollmentStatus(enrollment.status),
        total_published_lessons=totals.total_published_lessons,
        completed_current_lessons=totals.completed_current_lessons,
        needs_review_lessons=totals.needs_review_lessons,
        percent_complete=totals.percent_complete, is_complete=totals.is_complete,
        modules=[ModuleProgressEntry(
            module_id=bucket["module"].id, sequence=bucket["module"].sequence,
            title=bucket["module"].title,
            published_lesson_count=bucket["published_lesson_count"],
            completed_current_lessons=bucket["completed_current_lessons"],
            needs_review_lessons=bucket["needs_review_lessons"],
            percent_complete=percent(bucket["completed_current_lessons"],
                                     bucket["published_lesson_count"]))
            for bucket in totals.modules],
        lessons=[LessonProgressEntry(
            lesson_id=state.lesson.id, sequence=state.lesson.sequence,
            title=state.lesson.title, lesson_version=state.lesson.content_version,
            status=CompletionState(state.status), completed_at=state.completed_at,
            last_completed_version=state.last_completed_version)
            for state in totals.lessons])


@router.get("/me/enrollments/{enrollment_id}/progress", response_model=EnrollmentProgress,
            tags=["Progress"])
def read_own_progress(enrollment_id: str, context: AuthContext = Depends(get_auth_context),
                      db: DbSession = Depends(get_db)):
    authorize(context, {Role.student})
    enrollment = own_enrollment(db, context, enrollment_id)
    cohort = db.get(CourseCohort, enrollment.cohort_id)
    if cohort is None:
        raise HTTPException(status_code=404, detail="Class not found")
    return serialize_enrollment_progress(db, enrollment, cohort)


def class_progress(db: DbSession, cohort: CourseCohort, limit: int, offset: int) -> ClassProgress:
    """Aggregate over the whole class, then paginate the rows — never an average of one page."""
    lessons = published_curriculum(db, cohort.course_id)
    rows = db.execute(
        select(CohortEnrollment, User.full_name)
        .join(User, User.id == CohortEnrollment.student_user_id)
        .where(CohortEnrollment.cohort_id == cohort.id)
        .order_by(User.full_name, CohortEnrollment.id)).all()
    events = events_for_enrollments(db, [row[0].id for row in rows])

    computed = [(enrollment, full_name, build_progress(lessons, events.get(enrollment.id, {})))
                for enrollment, full_name in rows]
    active = [totals for enrollment, _, totals in computed
              if enrollment.status == ACTIVE_ENROLLMENT]
    average = round(sum(item.percent_complete for item in active) / len(active), 1) if active else 0.0
    page = computed[offset:offset + limit]
    return ClassProgress(
        cohort_id=cohort.id, course_id=cohort.course_id, cohort_status=CohortStatus(cohort.status),
        total_published_lessons=len(lessons),
        total_active_enrollments=len(active), total_visible_enrollments=len(computed),
        average_percent_complete=average,
        students=PageClassStudentProgress(
            items=[ClassStudentProgress(
                enrollment_id=enrollment.id, student_user_id=enrollment.student_user_id,
                student_full_name=full_name,
                enrollment_status=EnrollmentStatus(enrollment.status),
                completed_current_lessons=totals.completed_current_lessons,
                total_published_lessons=totals.total_published_lessons,
                needs_review_lessons=totals.needs_review_lessons,
                percent_complete=totals.percent_complete)
                for enrollment, full_name, totals in page],
            limit=limit, offset=offset, total=len(computed)))


@router.get("/instructor/cohorts/{cohort_id}/progress", response_model=ClassProgress,
            tags=["Teaching"])
def read_class_progress(cohort_id: str, limit: int = Query(30, ge=1, le=100),
                        offset: int = Query(0, ge=0),
                        context: AuthContext = Depends(get_auth_context),
                        db: DbSession = Depends(get_db)):
    authorize(context, {Role.instructor})
    return class_progress(db, instructor_cohort(db, context, cohort_id), limit, offset)


@router.get("/admin/cohorts/{cohort_id}/progress", response_model=ClassProgress,
            tags=["Cohort management"])
def read_admin_class_progress(cohort_id: str, limit: int = Query(30, ge=1, le=100),
                              offset: int = Query(0, ge=0),
                              context: AuthContext = Depends(get_auth_context),
                              db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    return class_progress(db, get_cohort(db, cohort_id), limit, offset)
