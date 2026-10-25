"""Request and response shapes for the academic catalog (Milestone 02A).

Contract notes (see docs/MILESTONE_02A_BACKEND_REPORT.md for the full deviation list):
- Identifiers are plain strings, matching every existing 01x schema, rather than the
  ``format: uuid`` alias proposed in the design document.
- ``extra="forbid"`` on every input model makes unknown client fields a 422 instead of a
  silent no-op, so a client cannot smuggle ``status``, ``published_at`` or an actor id.
"""
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import ContentStatus, ResourceType

COURSE_CODE_PATTERN = r"^[A-Z0-9-]+$"
ASSET_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CourseCreate(CatalogModel):
    code: str = Field(min_length=2, max_length=40, pattern=COURSE_CODE_PATTERN)
    title: str = Field(min_length=3, max_length=160)
    edition: str = Field(min_length=1, max_length=40)
    summary: str = Field(default="", max_length=2000)
    planned_module_count: int = Field(ge=1, le=1000)


class CoursePatch(CatalogModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    summary: str | None = Field(default=None, max_length=2000)
    planned_module_count: int | None = Field(default=None, ge=1, le=1000)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        return self


class CoursePublic(BaseModel):
    id: str
    code: str
    title: str
    summary: str = ""
    edition: str
    status: ContentStatus
    planned_module_count: int
    published_module_count: int
    content_version: int
    published_at: datetime | None = None


class ModuleCreate(CatalogModel):
    sequence: int = Field(ge=1, le=1000)
    title: str = Field(min_length=3, max_length=160)
    summary: str = Field(default="", max_length=2000)


class ModulePatch(CatalogModel):
    sequence: int | None = Field(default=None, ge=1, le=1000)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    summary: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        return self


class ModulePublic(BaseModel):
    id: str
    course_id: str
    sequence: int
    title: str
    summary: str = ""
    status: ContentStatus
    published_at: datetime | None = None


class ResourceInput(CatalogModel):
    title: str = Field(min_length=2, max_length=180)
    type: ResourceType
    external_url: str | None = Field(default=None, max_length=2048)
    asset_reference: str | None = Field(default=None, max_length=250)

    @field_validator("external_url")
    @classmethod
    def only_http_links(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.lower().startswith(("https://", "http://")):
            raise ValueError("external_url must be an absolute http(s) URL")
        return value

    @field_validator("asset_reference")
    @classmethod
    def safe_asset_reference(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # Relative logical name only: no absolute or escaping server paths.
        if not ASSET_REFERENCE_PATTERN.fullmatch(value) or ".." in value:
            raise ValueError("asset_reference must be a relative safe identifier")
        return value

    @model_validator(mode="after")
    def consistent_shape(self):
        if self.type is ResourceType.external_link:
            if not self.external_url:
                raise ValueError("external_link resources require external_url")
            if self.asset_reference:
                raise ValueError("external_link resources cannot carry asset_reference")
        if self.type is ResourceType.download_reference and not self.asset_reference:
            raise ValueError("download_reference resources require asset_reference")
        return self


class ObjectivePublic(BaseModel):
    sequence: int
    text: str


class ResourcePublic(BaseModel):
    id: str
    sequence: int
    title: str
    type: ResourceType
    external_url: str | None = None
    asset_reference: str | None = None


class LessonCreate(CatalogModel):
    sequence: int = Field(ge=1, le=1000)
    title: str = Field(min_length=3, max_length=160)
    body_markdown: str = Field(default="", max_length=100_000)
    objectives: list[str] = Field(default_factory=list, max_length=40)
    resources: list[ResourceInput] = Field(default_factory=list, max_length=60)

    @field_validator("objectives")
    @classmethod
    def bounded_objectives(cls, value: list[str]) -> list[str]:
        cleaned = []
        for objective in value:
            text = objective.strip()
            if not 2 <= len(text) <= 500:
                raise ValueError("Each objective must be 2 to 500 characters")
            cleaned.append(text)
        return cleaned


class LessonPatch(CatalogModel):
    sequence: int | None = Field(default=None, ge=1, le=1000)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    body_markdown: str | None = Field(default=None, max_length=100_000)
    objectives: list[str] | None = Field(default=None, max_length=40)
    resources: list[ResourceInput] | None = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be supplied")
        return self

    @field_validator("objectives")
    @classmethod
    def bounded_objectives(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = []
        for objective in value:
            text = objective.strip()
            if not 2 <= len(text) <= 500:
                raise ValueError("Each objective must be 2 to 500 characters")
            cleaned.append(text)
        return cleaned


class LessonSummary(BaseModel):
    id: str
    module_id: str
    sequence: int
    title: str
    status: ContentStatus
    content_version: int


class LessonDetail(LessonSummary):
    body_markdown: str
    objectives: list[ObjectivePublic] = Field(default_factory=list)
    resources: list[ResourcePublic] = Field(default_factory=list)


class PageCourses(BaseModel):
    items: list[CoursePublic]
    limit: int
    offset: int
    total: int
