from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from sqlalchemy import (Boolean, CheckConstraint, DateTime, Enum as SQLEnum, ForeignKey, Index,
                        Integer, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Role(str, Enum):
    student = "student"
    instructor = "instructor"
    manager = "manager"
    administrator = "administrator"

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[Role] = mapped_column(SQLEnum(Role))
    user: Mapped[User] = relationship(back_populates="roles")

class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    active_role: Mapped[Role] = mapped_column(SQLEnum(Role), default=Role.student)
    authenticated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    mfa_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

class InstructorRequest(Base):
    __tablename__ = "instructor_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reason: Mapped[str] = mapped_column(String(500), default="")

class OneTimeToken(Base):
    __tablename__ = "one_time_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    token_digest: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    target_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class MFAEnrollment(Base):
    __tablename__ = "mfa_enrollments"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    secret_encrypted: Mapped[str] = mapped_column(String(512))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_counter: Mapped[int] = mapped_column(default=-1)

class MFARecoveryCode(Base):
    __tablename__ = "mfa_recovery_codes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    code_digest: Mapped[str] = mapped_column(String(64), unique=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class RateLimitEvent(Base):
    __tablename__ = "rate_limit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    key_digest: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    subject_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContentStatus(str, Enum):
    """Publication lifecycle shared by every catalog record."""

    draft = "draft"
    published = "published"
    archived = "archived"


class ResourceType(str, Enum):
    external_link = "external_link"
    reference = "reference"
    download_reference = "download_reference"


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_courses_status"),
        CheckConstraint("planned_module_count > 0", name="ck_courses_planned_count"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(String(2000), default="")
    edition: Mapped[str] = mapped_column(String(40))
    planned_module_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=ContentStatus.draft.value, index=True)
    content_version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    modules: Mapped[list["CourseModule"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="CourseModule.sequence")


class CourseModule(Base):
    __tablename__ = "course_modules"
    __table_args__ = (
        UniqueConstraint("course_id", "sequence", name="uq_course_modules_sequence"),
        CheckConstraint("sequence >= 1", name="ck_course_modules_sequence_positive"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_course_modules_status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(String(2000), default="")
    status: Mapped[str] = mapped_column(String(20), default=ContentStatus.draft.value, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list["ModuleLesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="ModuleLesson.sequence")


class ModuleLesson(Base):
    __tablename__ = "module_lessons"
    __table_args__ = (
        UniqueConstraint("module_id", "sequence", name="uq_module_lessons_sequence"),
        CheckConstraint("sequence >= 1", name="ck_module_lessons_sequence_positive"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_module_lessons_status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    module_id: Mapped[str] = mapped_column(ForeignKey("course_modules.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160))
    body_markdown: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default=ContentStatus.draft.value, index=True)
    content_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    module: Mapped[CourseModule] = relationship(back_populates="lessons")
    objectives: Mapped[list["LessonObjective"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="LessonObjective.sequence")
    resources: Mapped[list["LearningResource"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="LearningResource.sequence")


class LessonObjective(Base):
    __tablename__ = "lesson_objectives"
    __table_args__ = (
        UniqueConstraint("lesson_id", "sequence", name="uq_lesson_objectives_sequence"),
        CheckConstraint("sequence >= 1", name="ck_lesson_objectives_sequence_positive"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    lesson_id: Mapped[str] = mapped_column(ForeignKey("module_lessons.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(500))
    lesson: Mapped[ModuleLesson] = relationship(back_populates="objectives")


class LearningResource(Base):
    __tablename__ = "learning_resources"
    __table_args__ = (
        UniqueConstraint("lesson_id", "sequence", name="uq_learning_resources_sequence"),
        CheckConstraint("sequence >= 1", name="ck_learning_resources_sequence_positive"),
        CheckConstraint("type IN ('external_link', 'reference', 'download_reference')",
                        name="ck_learning_resources_type"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    lesson_id: Mapped[str] = mapped_column(ForeignKey("module_lessons.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(180))
    type: Mapped[str] = mapped_column(String(24))
    external_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    asset_reference: Mapped[str | None] = mapped_column(String(250), nullable=True)
    lesson: Mapped[ModuleLesson] = relationship(back_populates="resources")


class CohortStatus(str, Enum):
    """Lifecycle of a teaching class."""

    draft = "draft"
    active = "active"
    completed = "completed"
    archived = "archived"


class EnrollmentStatus(str, Enum):
    active = "active"
    withdrawn = "withdrawn"


class CourseCohort(Base):
    __tablename__ = "course_cohorts"
    __table_args__ = (
        UniqueConstraint("course_id", "code", name="uq_course_cohorts_code"),
        CheckConstraint("status IN ('draft', 'active', 'completed', 'archived')",
                        name="ck_course_cohorts_status"),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
                        name="ck_course_cohorts_dates"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default=CohortStatus.draft.value, index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    course: Mapped[Course] = relationship()
    instructors: Mapped[list["CohortInstructor"]] = relationship(
        back_populates="cohort", cascade="all, delete-orphan",
        order_by="CohortInstructor.assigned_at")
    enrollments: Mapped[list["CohortEnrollment"]] = relationship(
        back_populates="cohort", cascade="all, delete-orphan",
        order_by="CohortEnrollment.enrolled_at")


class CohortInstructor(Base):
    """Teaching assignment. Removal is soft: ``removed_at`` closes the window."""

    __tablename__ = "cohort_instructors"
    __table_args__ = (
        UniqueConstraint("cohort_id", "instructor_user_id",
                         name="uq_cohort_instructors_assignment"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    cohort_id: Mapped[str] = mapped_column(ForeignKey("course_cohorts.id", ondelete="CASCADE"),
                                           index=True)
    instructor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    assigned_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cohort: Mapped[CourseCohort] = relationship(back_populates="instructors")
    instructor: Mapped[User] = relationship()


class CohortEnrollment(Base):
    """Student membership of a class. Academic progress belongs to Milestone 02C."""

    __tablename__ = "cohort_enrollments"
    __table_args__ = (
        UniqueConstraint("cohort_id", "student_user_id", name="uq_cohort_enrollments_student"),
        CheckConstraint("status IN ('active', 'withdrawn')",
                        name="ck_cohort_enrollments_status"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    cohort_id: Mapped[str] = mapped_column(ForeignKey("course_cohorts.id", ondelete="CASCADE"),
                                           index=True)
    student_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=EnrollmentStatus.active.value,
                                        index=True)
    enrolled_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    cohort: Mapped[CourseCohort] = relationship(back_populates="enrollments")
    student: Mapped[User] = relationship()


class LessonCompletionEvent(Base):
    """Immutable evidence that a student marked one lesson version complete.

    One row per (enrollment, lesson, lesson_version): re-completing an unchanged version reuses
    the original row, and a later content revision adds a new row instead of erasing the old one.
    No cascade from enrollments or lessons, so evidence cannot disappear with a future class
    delete.
    """

    __tablename__ = "lesson_completion_events"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "lesson_id", "lesson_version",
                         name="uq_lesson_completion_events_version"),
        CheckConstraint("lesson_version >= 1", name="ck_lesson_completion_events_version"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    enrollment_id: Mapped[str] = mapped_column(ForeignKey("cohort_enrollments.id"), index=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("module_lessons.id"), index=True)
    lesson_version: Mapped[int] = mapped_column(Integer)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
