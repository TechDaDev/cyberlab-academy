"""Request and response shapes for classes, assignments and enrollments (Milestone 02B).

Inputs forbid unknown fields and never accept an actor, timestamp, status-on-create or a
``course_id`` change, so lifecycle and ownership stay server-controlled.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import CohortStatus, EnrollmentStatus
from .schemas_catalog import CatalogModel, CoursePublic

COHORT_CODE_PATTERN = r"^[A-Z0-9-]+$"


def _require_order(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at and ends_at and ends_at <= starts_at:
        raise ValueError("ends_at must be after starts_at")


class CohortCreate(CatalogModel):
    course_id: str = Field(min_length=36, max_length=36)
    code: str = Field(min_length=2, max_length=40, pattern=COHORT_CODE_PATTERN)
    name: str = Field(min_length=1, max_length=160)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def non_blank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def ordered_dates(self):
        _require_order(self.starts_at, self.ends_at)
        return self


class CohortPatch(CatalogModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def non_blank_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("name must not be blank")
        return value.strip()

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        return self


class CohortPublic(BaseModel):
    id: str
    course_id: str
    code: str
    name: str
    status: CohortStatus
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    active_instructor_count: int = 0
    active_enrollment_count: int = 0


class PageCohorts(BaseModel):
    items: list[CohortPublic]
    limit: int
    offset: int
    total: int


class CohortInstructorAssign(CatalogModel):
    instructor_user_id: str = Field(min_length=36, max_length=36)


class CohortInstructorPublic(BaseModel):
    id: str
    cohort_id: str
    instructor_user_id: str
    instructor_name: str
    active: bool
    assigned_at: datetime
    removed_at: datetime | None = None


class EnrollmentCreate(CatalogModel):
    student_user_id: str = Field(min_length=36, max_length=36)


class EnrollmentTransition(CatalogModel):
    """Only the target state is accepted; the server owns timestamps and actors."""

    status: EnrollmentStatus


class EnrollmentPublic(BaseModel):
    """Administrative enrollment view. ``student_full_name`` is read-only and server-derived."""

    id: str
    cohort_id: str
    course_id: str
    student_user_id: str
    student_full_name: str
    status: EnrollmentStatus
    enrolled_at: datetime
    ended_at: datetime | None = None


class PageEnrollments(BaseModel):
    items: list[EnrollmentPublic]
    limit: int
    offset: int
    total: int


class StudentEnrollmentPublic(BaseModel):
    """A student's own enrollment: no other learner's data, no confidential fields."""

    id: str
    cohort_id: str
    cohort_code: str
    cohort_name: str
    cohort_status: CohortStatus
    course_id: str
    course_code: str
    course_title: str
    status: EnrollmentStatus
    enrolled_at: datetime
    ended_at: datetime | None = None


class PageStudentEnrollments(BaseModel):
    items: list[StudentEnrollmentPublic]
    limit: int
    offset: int
    total: int


class OwnEnrollmentCourse(BaseModel):
    enrollment: StudentEnrollmentPublic
    cohort: CohortPublic
    course: CoursePublic


class RosterEntry(BaseModel):
    user_id: str
    full_name: str
    email: str
    email_verified: bool
    status: EnrollmentStatus
    enrolled_at: datetime


class PageRoster(BaseModel):
    items: list[RosterEntry]
    limit: int
    offset: int
    total: int


__all__ = [
    "CohortCreate", "CohortPatch", "CohortPublic", "PageCohorts", "CohortInstructorAssign",
    "CohortInstructorPublic", "EnrollmentCreate", "EnrollmentTransition", "EnrollmentPublic",
    "PageEnrollments", "StudentEnrollmentPublic", "PageStudentEnrollments",
    "OwnEnrollmentCourse", "RosterEntry", "PageRoster", "ConfigDict",
]
