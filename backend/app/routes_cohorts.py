"""Classes (cohorts), instructor assignments, student enrollments and scoped reads.

Administrative routes let Managers/Administrators run classes; instructor and student routes
expose only what a live relationship justifies. Eligibility is always resolved from the
database server-side — never from a client-supplied role, cohort id or status.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext, authorize, get_auth_context
from .access import holds_assignment
from .database import get_db
from .models import (AuditEvent, CohortEnrollment, CohortInstructor, CohortStatus, ContentStatus,
                     Course, CourseCohort, Role, User, UserRole, utcnow)
from .routes_catalog import CONTENT_MANAGERS, course_public, paginate, published_module_counts
from .schemas_catalog import CoursePublic
from .schemas_cohorts import (CohortCreate, CohortInstructorAssign, CohortInstructorPublic,
                              CohortPatch, CohortPublic, EnrollmentCreate, EnrollmentPublic,
                              EnrollmentTransition, OwnEnrollmentCourse, PageCohorts,
                              PageEnrollments, PageRoster, PageStudentEnrollments, RosterEntry,
                              StudentEnrollmentPublic)
from .security import require_origin

router = APIRouter(prefix="/api/v1")
DRAFT = CohortStatus.draft.value
ACTIVE = CohortStatus.active.value
COMPLETED = CohortStatus.completed.value
ARCHIVED = CohortStatus.archived.value
ENROLLED = "active"
WITHDRAWN = "withdrawn"


# ------------------------------------------------------------------------------- helpers

def get_cohort(db: DbSession, cohort_id: str) -> CourseCohort:
    cohort = db.get(CourseCohort, cohort_id)
    if cohort is None:
        raise HTTPException(status_code=404, detail="Class not found")
    return cohort


def get_enrollment(db: DbSession, enrollment_id: str) -> CohortEnrollment:
    enrollment = db.get(CohortEnrollment, enrollment_id)
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return enrollment


def active_instructor_counts(db: DbSession, cohort_ids: list[str]) -> dict[str, int]:
    if not cohort_ids:
        return {}
    instructor_role = select(UserRole.id).where(
        UserRole.user_id == CohortInstructor.instructor_user_id,
        UserRole.role == Role.instructor).exists()
    rows = db.execute(
        select(CohortInstructor.cohort_id, func.count(CohortInstructor.id))
        .join(User, User.id == CohortInstructor.instructor_user_id)
        .where(CohortInstructor.cohort_id.in_(cohort_ids),
               CohortInstructor.removed_at.is_(None),
               User.is_active.is_(True),
               instructor_role)
        .group_by(CohortInstructor.cohort_id)).all()
    return {cohort_id: total for cohort_id, total in rows}


def active_enrollment_counts(db: DbSession, cohort_ids: list[str]) -> dict[str, int]:
    if not cohort_ids:
        return {}
    rows = db.execute(
        select(CohortEnrollment.cohort_id, func.count(CohortEnrollment.id))
        .where(CohortEnrollment.cohort_id.in_(cohort_ids), CohortEnrollment.status == ENROLLED)
        .group_by(CohortEnrollment.cohort_id)).all()
    return {cohort_id: total for cohort_id, total in rows}


def cohort_public(cohort: CourseCohort, instructors: int, enrollments: int) -> CohortPublic:
    return CohortPublic(
        id=cohort.id, course_id=cohort.course_id, code=cohort.code, name=cohort.name,
        status=CohortStatus(cohort.status), starts_at=cohort.starts_at, ends_at=cohort.ends_at,
        created_at=cohort.created_at, updated_at=cohort.updated_at,
        active_instructor_count=instructors, active_enrollment_count=enrollments)


def describe_cohorts(db: DbSession, cohorts: list[CourseCohort]) -> list[CohortPublic]:
    ids = [cohort.id for cohort in cohorts]
    instructors = active_instructor_counts(db, ids)
    enrollments = active_enrollment_counts(db, ids)
    return [cohort_public(cohort, instructors.get(cohort.id, 0), enrollments.get(cohort.id, 0))
            for cohort in cohorts]


def enrollment_public(db: DbSession, enrollment: CohortEnrollment) -> EnrollmentPublic:
    cohort = db.get(CourseCohort, enrollment.cohort_id)
    return EnrollmentPublic(
        id=enrollment.id, cohort_id=enrollment.cohort_id,
        course_id=cohort.course_id if cohort else "",
        student_user_id=enrollment.student_user_id,
        status=enrollment.status,
        enrolled_at=enrollment.enrolled_at, ended_at=enrollment.ended_at)


def student_enrollment_public(db: DbSession, enrollment: CohortEnrollment) -> StudentEnrollmentPublic:
    cohort = db.get(CourseCohort, enrollment.cohort_id)
    course = db.get(Course, cohort.course_id) if cohort else None
    return StudentEnrollmentPublic(
        id=enrollment.id, cohort_id=enrollment.cohort_id,
        cohort_code=cohort.code if cohort else "", cohort_name=cohort.name if cohort else "",
        cohort_status=CohortStatus(cohort.status) if cohort else CohortStatus.archived,
        course_id=course.id if course else "", course_code=course.code if course else "",
        course_title=course.title if course else "",
        status=enrollment.status, enrolled_at=enrollment.enrolled_at,
        ended_at=enrollment.ended_at)


def audit(db: DbSession, context: AuthContext, action: str, subject_id: str, detail: str) -> None:
    db.add(AuditEvent(actor_id=context.user.id, subject_id=subject_id, action=action,
                      detail=detail[:500]))


def flush_unique(db: DbSession, conflict_detail: str) -> None:
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail) from exc


def commit_unique(db: DbSession, conflict_detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail) from exc


def require_state(cohort: CourseCohort, allowed: set[str], action: str) -> None:
    if cohort.status not in allowed:
        raise HTTPException(status_code=409,
                            detail=f"Cannot {action} a class in status '{cohort.status}'")


def live_assignments(db: DbSession, cohort_id: str) -> int:
    instructor_role = select(UserRole.id).where(
        UserRole.user_id == CohortInstructor.instructor_user_id,
        UserRole.role == Role.instructor).exists()
    return db.scalar(
        select(func.count(CohortInstructor.id))
        .join(User, User.id == CohortInstructor.instructor_user_id)
        .where(CohortInstructor.cohort_id == cohort_id,
               CohortInstructor.removed_at.is_(None),
               User.is_active.is_(True),
               instructor_role)) or 0


# -------------------------------------------------------------------- administration

@router.get("/admin/cohorts", response_model=PageCohorts, tags=["Cohort management"])
def list_cohorts(course_id: str | None = None, status: CohortStatus | None = None,
                 limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                 context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    query = select(CourseCohort)
    if course_id:
        query = query.where(CourseCohort.course_id == course_id)
    if status:
        query = query.where(CourseCohort.status == status.value)
    query = query.order_by(CourseCohort.code, CourseCohort.id)
    rows, total = paginate(db, query, limit, offset)
    return PageCohorts(items=describe_cohorts(db, rows), limit=limit, offset=offset, total=total)


@router.post("/admin/cohorts", response_model=CohortPublic, status_code=201,
             tags=["Cohort management"])
def create_cohort(payload: CohortCreate, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    cohort = CourseCohort(course_id=course.id, code=payload.code, name=payload.name,
                          status=DRAFT, starts_at=payload.starts_at, ends_at=payload.ends_at,
                          created_by=context.user.id)
    db.add(cohort)
    flush_unique(db, "A class with that code already exists for this course")
    audit(db, context, "cohort.created", cohort.id, f"Created draft class {cohort.code}")
    commit_unique(db, "A class with that code already exists for this course")
    db.refresh(cohort)
    return cohort_public(cohort, 0, 0)


@router.get("/admin/cohorts/{cohort_id}", response_model=CohortPublic,
            tags=["Cohort management"])
def read_cohort(cohort_id: str, context: AuthContext = Depends(get_auth_context),
                db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    return describe_cohorts(db, [get_cohort(db, cohort_id)])[0]


@router.patch("/admin/cohorts/{cohort_id}", response_model=CohortPublic,
              tags=["Cohort management"])
def update_cohort(cohort_id: str, payload: CohortPatch, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    changed = sorted(payload.model_fields_set)
    starts = payload.starts_at if "starts_at" in payload.model_fields_set else cohort.starts_at
    ends = payload.ends_at if "ends_at" in payload.model_fields_set else cohort.ends_at
    if starts and ends and ends <= starts:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")
    if payload.name is not None:
        cohort.name = payload.name
    if "starts_at" in payload.model_fields_set:
        cohort.starts_at = payload.starts_at
    if "ends_at" in payload.model_fields_set:
        cohort.ends_at = payload.ends_at
    cohort.updated_at = utcnow()
    audit(db, context, "cohort.updated", cohort.id, "Updated " + ", ".join(changed))
    db.commit()
    db.refresh(cohort)
    return describe_cohorts(db, [cohort])[0]


@router.post("/admin/cohorts/{cohort_id}/activate", response_model=CohortPublic,
             tags=["Cohort management"])
def activate_cohort(cohort_id: str, request: Request,
                    context: AuthContext = Depends(get_auth_context),
                    db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    require_state(cohort, {DRAFT}, "activate")
    course = db.get(Course, cohort.course_id)
    if course is None or course.status != ContentStatus.published.value:
        raise HTTPException(status_code=409,
                            detail="Publish the course before activating its classes")
    if live_assignments(db, cohort.id) == 0:
        raise HTTPException(status_code=409,
                            detail="Assign at least one eligible instructor before activating")
    cohort.status = ACTIVE
    cohort.updated_at = utcnow()
    audit(db, context, "cohort.activated", cohort.id, f"Activated class {cohort.code}")
    db.commit()
    db.refresh(cohort)
    return describe_cohorts(db, [cohort])[0]


@router.post("/admin/cohorts/{cohort_id}/complete", response_model=CohortPublic,
             tags=["Cohort management"])
def complete_cohort(cohort_id: str, request: Request,
                    context: AuthContext = Depends(get_auth_context),
                    db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    require_state(cohort, {ACTIVE}, "complete")
    cohort.status = COMPLETED
    cohort.updated_at = utcnow()
    audit(db, context, "cohort.completed", cohort.id, f"Completed class {cohort.code}")
    db.commit()
    db.refresh(cohort)
    return describe_cohorts(db, [cohort])[0]


@router.post("/admin/cohorts/{cohort_id}/archive", response_model=CohortPublic,
             tags=["Cohort management"])
def archive_cohort(cohort_id: str, request: Request,
                   context: AuthContext = Depends(get_auth_context),
                   db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    require_state(cohort, {DRAFT, COMPLETED}, "archive")
    cohort.status = ARCHIVED
    cohort.updated_at = utcnow()
    audit(db, context, "cohort.archived", cohort.id, f"Archived class {cohort.code}")
    db.commit()
    db.refresh(cohort)
    return describe_cohorts(db, [cohort])[0]


@router.get("/admin/cohorts/{cohort_id}/instructors",
            response_model=list[CohortInstructorPublic], tags=["Cohort management"])
def list_cohort_instructors(cohort_id: str, context: AuthContext = Depends(get_auth_context),
                           db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    get_cohort(db, cohort_id)
    rows = db.execute(
        select(CohortInstructor, User)
        .join(User, User.id == CohortInstructor.instructor_user_id)
        .where(CohortInstructor.cohort_id == cohort_id)
        .order_by(CohortInstructor.assigned_at)).all()
    return [CohortInstructorPublic(
        id=assignment.id, cohort_id=assignment.cohort_id,
        instructor_user_id=assignment.instructor_user_id, instructor_name=user.full_name,
        active=assignment.removed_at is None, assigned_at=assignment.assigned_at,
        removed_at=assignment.removed_at) for assignment, user in rows]


@router.post("/admin/cohorts/{cohort_id}/instructors", response_model=CohortInstructorPublic,
             status_code=201, tags=["Cohort management"])
def assign_instructor(cohort_id: str, payload: CohortInstructorAssign, request: Request,
                      context: AuthContext = Depends(get_auth_context),
                      db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    if cohort.status == ARCHIVED:
        raise HTTPException(status_code=409, detail="Cannot assign instructors to an archived class")
    target = db.get(User, payload.instructor_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.is_active:
        raise HTTPException(status_code=409, detail="User account is not active")
    if Role.instructor not in {entry.role for entry in target.roles}:
        raise HTTPException(status_code=409, detail="User does not hold the Instructor role")
    assignment = db.scalar(select(CohortInstructor).where(
        CohortInstructor.cohort_id == cohort.id,
        CohortInstructor.instructor_user_id == target.id))
    if assignment is not None and assignment.removed_at is None:
        raise HTTPException(status_code=409, detail="Instructor is already assigned to this class")
    if assignment is None:
        assignment = CohortInstructor(cohort_id=cohort.id, instructor_user_id=target.id,
                                      assigned_by=context.user.id, assigned_at=utcnow())
        db.add(assignment)
        action, detail = "cohort.instructor_assigned", f"Assigned {target.full_name}"
    else:
        assignment.removed_at = None
        assignment.assigned_at = utcnow()
        assignment.assigned_by = context.user.id
        action, detail = "cohort.instructor_assigned", f"Reassigned {target.full_name}"
    flush_unique(db, "Instructor is already assigned to this class")
    audit(db, context, action, cohort.id, detail)
    commit_unique(db, "Instructor is already assigned to this class")
    db.refresh(assignment)
    return CohortInstructorPublic(
        id=assignment.id, cohort_id=cohort.id, instructor_user_id=target.id,
        instructor_name=target.full_name, active=True, assigned_at=assignment.assigned_at,
        removed_at=None)


@router.delete("/admin/cohorts/{cohort_id}/instructors/{user_id}", status_code=204,
               tags=["Cohort management"])
def remove_instructor(cohort_id: str, user_id: str, request: Request,
                      context: AuthContext = Depends(get_auth_context),
                      db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    assignment = db.scalar(select(CohortInstructor).where(
        CohortInstructor.cohort_id == cohort.id,
        CohortInstructor.instructor_user_id == user_id,
        CohortInstructor.removed_at.is_(None)))
    if assignment is None:
        raise HTTPException(status_code=404, detail="Active assignment not found")
    assignment.removed_at = utcnow()
    audit(db, context, "cohort.instructor_removed", cohort.id, "Removed an instructor assignment")
    db.commit()
    return Response(status_code=204)


@router.get("/admin/cohorts/{cohort_id}/enrollments", response_model=PageEnrollments,
            tags=["Cohort management"])
def list_enrollments(cohort_id: str, status: str | None = None,
                     limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                     context: AuthContext = Depends(get_auth_context),
                     db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    get_cohort(db, cohort_id)
    query = select(CohortEnrollment).where(CohortEnrollment.cohort_id == cohort_id)
    if status:
        query = query.where(CohortEnrollment.status == status)
    query = query.order_by(CohortEnrollment.enrolled_at, CohortEnrollment.id)
    rows, total = paginate(db, query, limit, offset)
    return PageEnrollments(items=[enrollment_public(db, row) for row in rows],
                           limit=limit, offset=offset, total=total)


@router.post("/admin/cohorts/{cohort_id}/enrollments", response_model=EnrollmentPublic,
             status_code=201, tags=["Cohort management"])
def create_enrollment(cohort_id: str, payload: EnrollmentCreate, request: Request,
                      context: AuthContext = Depends(get_auth_context),
                      db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    cohort = get_cohort(db, cohort_id)
    if cohort.status != ACTIVE:
        raise HTTPException(status_code=409, detail="Only an active class can be enrolled into")
    target = db.get(User, payload.student_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.is_active:
        raise HTTPException(status_code=409, detail="User account is not active")
    if not target.email_verified:
        raise HTTPException(status_code=409, detail="User must verify their email before enrolling")
    if Role.student not in {entry.role for entry in target.roles}:
        raise HTTPException(status_code=409, detail="User does not hold the Student role")
    enrollment = CohortEnrollment(cohort_id=cohort.id, student_user_id=target.id,
                                  status=ENROLLED, enrolled_by=context.user.id,
                                  enrolled_at=utcnow())
    db.add(enrollment)
    flush_unique(db, "Student already has an enrollment in this class")
    audit(db, context, "cohort.enrollment_created", cohort.id,
          f"Enrolled {target.full_name} in {cohort.code}")
    commit_unique(db, "Student already has an enrollment in this class")
    db.refresh(enrollment)
    return enrollment_public(db, enrollment)


@router.patch("/admin/enrollments/{enrollment_id}", response_model=EnrollmentPublic,
              tags=["Cohort management"])
def update_enrollment(enrollment_id: str, payload: EnrollmentTransition, request: Request,
                      context: AuthContext = Depends(get_auth_context),
                      db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    enrollment = get_enrollment(db, enrollment_id)
    target = payload.status.value
    if enrollment.status == target:
        raise HTTPException(status_code=409, detail=f"Enrollment is already {target}")
    if target == WITHDRAWN:
        enrollment.status = WITHDRAWN
        enrollment.ended_at = utcnow()
        action = "cohort.enrollment_withdrawn"
    else:
        cohort = get_cohort(db, enrollment.cohort_id)
        if cohort.status != ACTIVE:
            raise HTTPException(status_code=409,
                                detail="Only an active class can have enrollments reactivated")
        user = db.get(User, enrollment.student_user_id)
        if user is None or not user.is_active or not user.email_verified:
            raise HTTPException(status_code=409,
                                detail="Student account must be active and email verified")
        enrollment.status = ENROLLED
        enrollment.ended_at = None
        action = "cohort.enrollment_reactivated"
    enrollment.updated_at = utcnow()
    audit(db, context, action, enrollment.cohort_id, f"Enrollment {enrollment.id} -> {target}")
    db.commit()
    db.refresh(enrollment)
    return enrollment_public(db, enrollment)


# ------------------------------------------------------------------------- instructor

def instructor_cohort(db: DbSession, context: AuthContext, cohort_id: str) -> CourseCohort:
    cohort = get_cohort(db, cohort_id)
    if not holds_assignment(db, context.user.id, cohort.id):
        raise HTTPException(status_code=404, detail="Class not found")
    return cohort


@router.get("/instructor/cohorts", response_model=PageCohorts, tags=["Teaching"])
def list_teaching_cohorts(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                          context: AuthContext = Depends(get_auth_context),
                          db: DbSession = Depends(get_db)):
    authorize(context, {Role.instructor})
    assigned = select(CohortInstructor.cohort_id).where(
        CohortInstructor.instructor_user_id == context.user.id,
        CohortInstructor.removed_at.is_(None))
    query = (select(CourseCohort)
             .where(CourseCohort.id.in_(assigned))
             .order_by(CourseCohort.code, CourseCohort.id))
    rows, total = paginate(db, query, limit, offset)
    return PageCohorts(items=describe_cohorts(db, rows), limit=limit, offset=offset, total=total)


@router.get("/instructor/cohorts/{cohort_id}", response_model=CohortPublic, tags=["Teaching"])
def read_teaching_cohort(cohort_id: str, context: AuthContext = Depends(get_auth_context),
                         db: DbSession = Depends(get_db)):
    authorize(context, {Role.instructor})
    return describe_cohorts(db, [instructor_cohort(db, context, cohort_id)])[0]


@router.get("/instructor/cohorts/{cohort_id}/students", response_model=PageRoster,
            tags=["Teaching"])
def read_cohort_roster(cohort_id: str, limit: int = Query(30, ge=1, le=100),
                       offset: int = Query(0, ge=0),
                       context: AuthContext = Depends(get_auth_context),
                       db: DbSession = Depends(get_db)):
    authorize(context, {Role.instructor})
    cohort = instructor_cohort(db, context, cohort_id)
    query = (select(CohortEnrollment, User)
             .join(User, User.id == CohortEnrollment.student_user_id)
             .where(CohortEnrollment.cohort_id == cohort.id,
                    CohortEnrollment.status == ENROLLED)
             .order_by(User.full_name, CohortEnrollment.id))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.limit(limit).offset(offset)).all()
    return PageRoster(items=[RosterEntry(
        user_id=user.id, full_name=user.full_name, email=user.email,
        email_verified=user.email_verified, status=enrollment.status,
        enrolled_at=enrollment.enrolled_at) for enrollment, user in rows],
        limit=limit, offset=offset, total=total)


# ---------------------------------------------------------------------------- student

@router.get("/me/enrollments", response_model=PageStudentEnrollments, tags=["Enrollment"])
def list_own_enrollments(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                         context: AuthContext = Depends(get_auth_context),
                         db: DbSession = Depends(get_db)):
    authorize(context, {Role.student})
    query = (select(CohortEnrollment)
             .where(CohortEnrollment.student_user_id == context.user.id)
             .order_by(CohortEnrollment.enrolled_at, CohortEnrollment.id))
    rows, total = paginate(db, query, limit, offset)
    return PageStudentEnrollments(
        items=[student_enrollment_public(db, row) for row in rows],
        limit=limit, offset=offset, total=total)


@router.get("/me/enrollments/{enrollment_id}/course", response_model=OwnEnrollmentCourse,
            tags=["Enrollment"])
def read_own_enrollment_course(enrollment_id: str,
                               context: AuthContext = Depends(get_auth_context),
                               db: DbSession = Depends(get_db)):
    authorize(context, {Role.student})
    enrollment = db.scalar(select(CohortEnrollment).where(
        CohortEnrollment.id == enrollment_id,
        CohortEnrollment.student_user_id == context.user.id))
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    cohort = get_cohort(db, enrollment.cohort_id)
    course = db.get(Course, cohort.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    published = published_module_counts(db, [course.id]).get(course.id, 0)
    return OwnEnrollmentCourse(
        enrollment=student_enrollment_public(db, enrollment),
        cohort=cohort_public(cohort, active_instructor_counts(db, [cohort.id]).get(cohort.id, 0),
                             active_enrollment_counts(db, [cohort.id]).get(cohort.id, 0)),
        course=CoursePublic(**course_public(course, published).model_dump()))
