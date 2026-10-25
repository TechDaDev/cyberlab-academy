"""Academic catalog: published read APIs and privileged content management.

Read endpoints serve only published content to non-privileged roles. Manager and
Administrator sessions (active role, not merely an assigned one) may additionally preview
drafts, because they are the roles that author the catalog. Lesson *bodies* stay privileged:
enrollment-based learner access arrives with cohorts in Phase 02B.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .auth_state import AuthContext, authorize, get_auth_context
from .database import get_db
from .models import (AuditEvent, ContentStatus, Course, CourseModule, LearningResource,
                     LessonObjective, ModuleLesson, ResourceType, Role, utcnow)
from .schemas_catalog import (CourseCreate, CoursePatch, CoursePublic, LessonCreate,
                              LessonDetail, LessonPatch, LessonSummary, ModuleCreate,
                              ModulePublic, ModulePatch, ObjectivePublic, PageCourses,
                              ResourceInput, ResourcePublic)
from .security import require_origin

router = APIRouter(prefix="/api/v1")
CONTENT_MANAGERS = {Role.manager, Role.administrator}
DRAFT = ContentStatus.draft.value
PUBLISHED = ContentStatus.published.value

LESSON_BODY_DENIED = ("Lesson content requires a cohort enrollment or instructor assignment "
                      "and is introduced in Phase 02B")


def manages_content(context: AuthContext) -> bool:
    return context.session.active_role in CONTENT_MANAGERS


def published_module_counts(db: DbSession, course_ids: list[str]) -> dict[str, int]:
    if not course_ids:
        return {}
    rows = db.execute(
        select(CourseModule.course_id, func.count())
        .where(CourseModule.course_id.in_(course_ids), CourseModule.status == PUBLISHED)
        .group_by(CourseModule.course_id)
    ).all()
    return {course_id: total for course_id, total in rows}


def course_public(course: Course, published_modules: int) -> CoursePublic:
    return CoursePublic(
        id=course.id, code=course.code, title=course.title, summary=course.summary,
        edition=course.edition, status=ContentStatus(course.status),
        planned_module_count=course.planned_module_count,
        published_module_count=published_modules, content_version=course.content_version,
        published_at=course.published_at,
    )


def module_public(module: CourseModule) -> ModulePublic:
    return ModulePublic(
        id=module.id, course_id=module.course_id, sequence=module.sequence,
        title=module.title, summary=module.summary, status=ContentStatus(module.status),
        published_at=module.published_at,
    )


def lesson_summary(lesson: ModuleLesson) -> LessonSummary:
    return LessonSummary(
        id=lesson.id, module_id=lesson.module_id, sequence=lesson.sequence,
        title=lesson.title, status=ContentStatus(lesson.status),
        content_version=lesson.content_version,
    )


def lesson_detail(lesson: ModuleLesson) -> LessonDetail:
    return LessonDetail(
        **lesson_summary(lesson).model_dump(),
        body_markdown=lesson.body_markdown,
        objectives=[ObjectivePublic(sequence=item.sequence, text=item.text)
                    for item in sorted(lesson.objectives, key=lambda row: row.sequence)],
        resources=[ResourcePublic(id=item.id, sequence=item.sequence, title=item.title,
                                  type=ResourceType(item.type), external_url=item.external_url,
                                  asset_reference=item.asset_reference)
                   for item in sorted(lesson.resources, key=lambda row: row.sequence)],
    )


def get_course(db: DbSession, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def get_module(db: DbSession, module_id: str) -> CourseModule:
    module = db.get(CourseModule, module_id)
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return module


def get_lesson(db: DbSession, lesson_id: str) -> ModuleLesson:
    lesson = db.get(ModuleLesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def visible_module(db: DbSession, module: CourseModule, context: AuthContext) -> CourseModule:
    """Published modules of published courses, or any module for content managers."""
    if manages_content(context):
        return module
    course = db.get(Course, module.course_id)
    if course is None or course.status != PUBLISHED or module.status != PUBLISHED:
        # Same 404 as a missing record so unpublished structure is indistinguishable.
        raise HTTPException(status_code=404, detail="Module not found")
    return module


def audit(db: DbSession, context: AuthContext, action: str, subject_id: str, detail: str) -> None:
    db.add(AuditEvent(actor_id=context.user.id, subject_id=subject_id, action=action,
                      detail=detail[:500]))


def flush_unique(db: DbSession, conflict_detail: str) -> None:
    """Surface a uniqueness violation raised during flush as a clean 409."""
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


def highest_module_sequence(db: DbSession, course_id: str) -> int:
    return db.scalar(select(func.max(CourseModule.sequence)).where(
        CourseModule.course_id == course_id)) or 0


def highest_lesson_sequence(db: DbSession, module_id: str) -> int:
    return db.scalar(select(func.max(ModuleLesson.sequence)).where(
        ModuleLesson.module_id == module_id)) or 0


def replace_objectives(db: DbSession, lesson: ModuleLesson, objectives: list[str]) -> None:
    lesson.objectives.clear()
    for index, text in enumerate(objectives, start=1):
        lesson.objectives.append(LessonObjective(sequence=index, text=text.strip()))


def replace_resources(db: DbSession, lesson: ModuleLesson, resources: list[ResourceInput]) -> None:
    lesson.resources.clear()
    for index, item in enumerate(resources, start=1):
        lesson.resources.append(LearningResource(
            sequence=index, title=item.title, type=item.type.value,
            external_url=item.external_url, asset_reference=item.asset_reference))


def paginate(db: DbSession, query, limit: int, offset: int):
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.limit(limit).offset(offset)).all()
    return rows, total


# ---------------------------------------------------------------- published catalog reads

@router.get("/courses", response_model=PageCourses, tags=["Catalog"])
def list_courses(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                 context: AuthContext = Depends(get_auth_context), db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    query = (select(Course)
             .where(Course.status == PUBLISHED)
             .order_by(Course.code, Course.id))
    rows, total = paginate(db, query, limit, offset)
    counts = published_module_counts(db, [course.id for course in rows])
    return PageCourses(items=[course_public(course, counts.get(course.id, 0)) for course in rows],
                       limit=limit, offset=offset, total=total)


@router.get("/courses/{course_id}", response_model=CoursePublic, tags=["Catalog"])
def read_course(course_id: str, context: AuthContext = Depends(get_auth_context),
                db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    course = get_course(db, course_id)
    if course.status != PUBLISHED:
        raise HTTPException(status_code=404, detail="Course not found")
    return course_public(course, published_module_counts(db, [course.id]).get(course.id, 0))


@router.get("/courses/{course_id}/modules", response_model=list[ModulePublic], tags=["Catalog"])
def list_modules(course_id: str, context: AuthContext = Depends(get_auth_context),
                 db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    course = get_course(db, course_id)
    if course.status != PUBLISHED:
        raise HTTPException(status_code=404, detail="Course not found")
    modules = db.scalars(select(CourseModule)
                         .where(CourseModule.course_id == course.id,
                                CourseModule.status == PUBLISHED)
                         .order_by(CourseModule.sequence)).all()
    return [module_public(module) for module in modules]


@router.get("/modules/{module_id}", response_model=ModulePublic, tags=["Catalog"])
def read_module(module_id: str, context: AuthContext = Depends(get_auth_context),
                db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    return module_public(visible_module(db, get_module(db, module_id), context))


@router.get("/modules/{module_id}/lessons", response_model=list[LessonSummary], tags=["Catalog"])
def list_lessons(module_id: str, context: AuthContext = Depends(get_auth_context),
                 db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    module = visible_module(db, get_module(db, module_id), context)
    query = select(ModuleLesson).where(ModuleLesson.module_id == module.id)
    if not manages_content(context):
        # Metadata for published lessons only; the body is never included here.
        query = query.where(ModuleLesson.status == PUBLISHED)
    lessons = db.scalars(query.order_by(ModuleLesson.sequence)).all()
    return [lesson_summary(lesson) for lesson in lessons]


@router.get("/lessons/{lesson_id}", response_model=LessonDetail, tags=["Catalog"])
def read_lesson(lesson_id: str, context: AuthContext = Depends(get_auth_context),
                db: DbSession = Depends(get_db)):
    authorize(context, set(Role))
    lesson = get_lesson(db, lesson_id)
    if not manages_content(context):
        raise HTTPException(status_code=403, detail=LESSON_BODY_DENIED)
    return lesson_detail(lesson)


# ------------------------------------------------------- privileged content management

@router.get("/admin/courses", response_model=PageCourses, tags=["Content management"])
def list_all_courses(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
                     context: AuthContext = Depends(get_auth_context),
                     db: DbSession = Depends(get_db)):
    authorize(context, CONTENT_MANAGERS)
    query = select(Course).order_by(Course.code, Course.id)
    rows, total = paginate(db, query, limit, offset)
    counts = published_module_counts(db, [course.id for course in rows])
    return PageCourses(items=[course_public(course, counts.get(course.id, 0)) for course in rows],
                       limit=limit, offset=offset, total=total)


@router.post("/admin/courses", response_model=CoursePublic, status_code=201,
             tags=["Content management"])
def create_course(payload: CourseCreate, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    course = Course(code=payload.code, title=payload.title.strip(), summary=payload.summary,
                    edition=payload.edition.strip(),
                    planned_module_count=payload.planned_module_count,
                    status=DRAFT, content_version=1, created_by=context.user.id)
    db.add(course)
    flush_unique(db, "Course code already exists")
    audit(db, context, "catalog.course_created", course.id,
          f"Created draft course {course.code}")
    commit_unique(db, "Course code already exists")
    db.refresh(course)
    return course_public(course, 0)


@router.patch("/admin/courses/{course_id}", response_model=CoursePublic,
              tags=["Content management"])
def update_course(course_id: str, payload: CoursePatch, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    course = get_course(db, course_id)
    changed = sorted(payload.model_fields_set)
    if payload.planned_module_count is not None:
        if payload.planned_module_count < highest_module_sequence(db, course.id):
            raise HTTPException(status_code=409,
                                detail="planned_module_count is below an existing module sequence")
        course.planned_module_count = payload.planned_module_count
    if payload.title is not None:
        course.title = payload.title.strip()
    if payload.summary is not None:
        course.summary = payload.summary
    course.updated_at = utcnow()
    course.content_version += 1
    audit(db, context, "catalog.course_updated", course.id, "Updated " + ", ".join(changed))
    db.commit()
    db.refresh(course)
    return course_public(course, published_module_counts(db, [course.id]).get(course.id, 0))


@router.post("/admin/courses/{course_id}/publish", response_model=CoursePublic,
             tags=["Content management"])
def publish_course(course_id: str, request: Request,
                   context: AuthContext = Depends(get_auth_context),
                   db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    course = get_course(db, course_id)
    if course.status != DRAFT:
        raise HTTPException(status_code=409,
                            detail=f"Course is {course.status}, not draft")
    course.status = PUBLISHED
    course.published_at = utcnow()
    course.updated_at = utcnow()
    audit(db, context, "catalog.course_published", course.id, f"Published course {course.code}")
    db.commit()
    db.refresh(course)
    return course_public(course, published_module_counts(db, [course.id]).get(course.id, 0))


@router.post("/admin/courses/{course_id}/modules", response_model=ModulePublic, status_code=201,
             tags=["Content management"])
def create_module(course_id: str, payload: ModuleCreate, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    course = get_course(db, course_id)
    if payload.sequence > course.planned_module_count:
        raise HTTPException(
            status_code=422,
            detail=f"sequence must not exceed the course planned_module_count "
                   f"({course.planned_module_count})")
    module = CourseModule(course_id=course.id, sequence=payload.sequence,
                          title=payload.title.strip(), summary=payload.summary, status=DRAFT)
    db.add(module)
    flush_unique(db, "A module already exists at that sequence")
    audit(db, context, "catalog.module_created", module.id,
          f"Created draft module {module.sequence} of {course.code}")
    commit_unique(db, "A module already exists at that sequence")
    db.refresh(module)
    return module_public(module)


@router.patch("/admin/modules/{module_id}", response_model=ModulePublic,
              tags=["Content management"])
def update_module(module_id: str, payload: ModulePatch, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    module = get_module(db, module_id)
    course = get_course(db, module.course_id)
    changed = sorted(payload.model_fields_set)
    if payload.sequence is not None and payload.sequence != module.sequence:
        if payload.sequence > course.planned_module_count:
            raise HTTPException(
                status_code=422,
                detail=f"sequence must not exceed the course planned_module_count "
                       f"({course.planned_module_count})")
        module.sequence = payload.sequence
    if payload.title is not None:
        module.title = payload.title.strip()
    if payload.summary is not None:
        module.summary = payload.summary
    module.updated_at = utcnow()
    audit(db, context, "catalog.module_updated", module.id, "Updated " + ", ".join(changed))
    commit_unique(db, "A module already exists at that sequence")
    db.refresh(module)
    return module_public(module)


@router.post("/admin/modules/{module_id}/publish", response_model=ModulePublic,
             tags=["Content management"])
def publish_module(module_id: str, request: Request,
                   context: AuthContext = Depends(get_auth_context),
                   db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    module = get_module(db, module_id)
    course = get_course(db, module.course_id)
    if course.status != PUBLISHED:
        raise HTTPException(status_code=409, detail="Publish the parent course first")
    if module.status != DRAFT:
        raise HTTPException(status_code=409, detail=f"Module is {module.status}, not draft")
    published_lessons = db.scalar(select(func.count()).select_from(ModuleLesson).where(
        ModuleLesson.module_id == module.id, ModuleLesson.status == PUBLISHED)) or 0
    if published_lessons == 0:
        raise HTTPException(status_code=409,
                            detail="A module needs at least one published lesson")
    module.status = PUBLISHED
    module.published_at = utcnow()
    module.updated_at = utcnow()
    audit(db, context, "catalog.module_published", module.id,
          f"Published module {module.sequence} of {course.code}")
    db.commit()
    db.refresh(module)
    return module_public(module)


@router.post("/admin/modules/{module_id}/lessons", response_model=LessonDetail, status_code=201,
             tags=["Content management"])
def create_lesson(module_id: str, payload: LessonCreate, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    module = get_module(db, module_id)
    lesson = ModuleLesson(module_id=module.id, sequence=payload.sequence,
                          title=payload.title.strip(), body_markdown=payload.body_markdown,
                          status=DRAFT, content_version=1)
    replace_objectives(db, lesson, payload.objectives)
    replace_resources(db, lesson, payload.resources)
    db.add(lesson)
    flush_unique(db, "A lesson already exists at that sequence")
    audit(db, context, "catalog.lesson_created", lesson.id,
          f"Created draft lesson {lesson.sequence} in module {module.sequence}")
    commit_unique(db, "A lesson already exists at that sequence")
    db.refresh(lesson)
    return lesson_detail(lesson)


@router.patch("/admin/lessons/{lesson_id}", response_model=LessonDetail,
              tags=["Content management"])
def update_lesson(lesson_id: str, payload: LessonPatch, request: Request,
                  context: AuthContext = Depends(get_auth_context),
                  db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    lesson = get_lesson(db, lesson_id)
    changed = sorted(payload.model_fields_set)
    if payload.sequence is not None and payload.sequence != lesson.sequence:
        lesson.sequence = payload.sequence
    if payload.title is not None:
        lesson.title = payload.title.strip()
    if payload.body_markdown is not None:
        lesson.body_markdown = payload.body_markdown
    if payload.objectives is not None:
        replace_objectives(db, lesson, payload.objectives)
    if payload.resources is not None:
        replace_resources(db, lesson, payload.resources)
    lesson.updated_at = utcnow()
    lesson.content_version += 1
    audit(db, context, "catalog.lesson_updated", lesson.id, "Updated " + ", ".join(changed))
    commit_unique(db, "A lesson already exists at that sequence")
    db.refresh(lesson)
    return lesson_detail(lesson)


@router.post("/admin/lessons/{lesson_id}/publish", response_model=LessonDetail,
             tags=["Content management"])
def publish_lesson(lesson_id: str, request: Request,
                   context: AuthContext = Depends(get_auth_context),
                   db: DbSession = Depends(get_db)):
    require_origin(request)
    authorize(context, CONTENT_MANAGERS, sensitive=True)
    lesson = get_lesson(db, lesson_id)
    if lesson.status != DRAFT:
        raise HTTPException(status_code=409, detail=f"Lesson is {lesson.status}, not draft")
    if not lesson.body_markdown.strip():
        raise HTTPException(status_code=409, detail="A lesson needs a non-empty body")
    lesson.status = PUBLISHED
    lesson.published_at = utcnow()
    lesson.updated_at = utcnow()
    audit(db, context, "catalog.lesson_published", lesson.id,
          f"Published lesson {lesson.sequence}")
    db.commit()
    db.refresh(lesson)
    return lesson_detail(lesson)
