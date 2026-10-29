"""Request and response shapes for lesson completion and derived progress (Milestone 02C).

``extra="forbid"`` on the request model means a client cannot smuggle a score, timestamp,
lesson version, grade or another student's identifier into a completion.
"""
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, StrictBool, model_validator

from .models import CohortStatus, EnrollmentStatus
from .schemas_catalog import CatalogModel


class CompletionState(str, Enum):
    not_started = "not_started"
    current = "current"
    needs_review = "needs_review"


class CompletionRequest(CatalogModel):
    """The only accepted action is "mark complete"; there is no un-complete in 02C."""

    completed: StrictBool

    @model_validator(mode="after")
    def only_true_is_accepted(self):
        if self.completed is not True:
            raise ValueError("Only {\"completed\": true} is accepted")
        return self


class CompletionResponse(BaseModel):
    enrollment_id: str
    lesson_id: str
    lesson_version: int
    completed_at: datetime
    newly_recorded: bool


class LessonProgressEntry(BaseModel):
    lesson_id: str
    sequence: int
    title: str
    lesson_version: int
    status: CompletionState
    completed_at: datetime | None = None
    last_completed_version: int | None = None


class ModuleProgressEntry(BaseModel):
    module_id: str
    sequence: int
    title: str
    published_lesson_count: int
    completed_current_lessons: int
    needs_review_lessons: int
    percent_complete: float


class EnrollmentProgress(BaseModel):
    enrollment_id: str
    course_id: str
    cohort_id: str
    cohort_status: CohortStatus
    enrollment_status: EnrollmentStatus
    total_published_lessons: int
    completed_current_lessons: int
    needs_review_lessons: int
    percent_complete: float
    is_complete: bool
    modules: list[ModuleProgressEntry] = Field(default_factory=list)
    lessons: list[LessonProgressEntry] = Field(default_factory=list)


class ClassStudentProgress(BaseModel):
    enrollment_id: str
    student_user_id: str
    student_full_name: str
    enrollment_status: EnrollmentStatus
    completed_current_lessons: int
    total_published_lessons: int
    needs_review_lessons: int
    percent_complete: float


class PageClassStudentProgress(BaseModel):
    items: list[ClassStudentProgress]
    limit: int
    offset: int
    total: int


class ClassProgress(BaseModel):
    """Class-level academic progress. Averages are over active enrollments, never grades."""

    cohort_id: str
    course_id: str
    cohort_status: CohortStatus
    total_published_lessons: int
    total_active_enrollments: int
    total_visible_enrollments: int
    average_percent_complete: float
    students: PageClassStudentProgress
