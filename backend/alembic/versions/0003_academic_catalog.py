"""Create the academic catalog: courses, modules, lessons, objectives and resources.

Revision ID: 0003_academic_catalog
Revises: 0002_account_security

Additive only. No account, session, token, MFA, rate-limit or audit table is altered, so the
existing Milestone 01D data stays valid and the downgrade simply removes the catalog tables.
Publication state is stored as a bounded string with a CHECK constraint rather than a native
enum type, which keeps SQLite tests and PostgreSQL migrations consistent.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_academic_catalog"
down_revision = "0002_account_security"
branch_labels = None
depends_on = None

STATUS_VALUES = "status IN ('draft', 'published', 'archived')"


def upgrade():
    op.create_table("courses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("summary", sa.String(2000), nullable=False, server_default=""),
        sa.Column("edition", sa.String(40), nullable=False),
        sa.Column("planned_module_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(STATUS_VALUES, name="ck_courses_status"),
        sa.CheckConstraint("planned_module_count > 0", name="ck_courses_planned_count"))
    op.create_index("ix_courses_code", "courses", ["code"], unique=True)
    op.create_index("ix_courses_status", "courses", ["status"])

    op.create_table("course_modules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("course_id", sa.String(36),
                  sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("summary", sa.String(2000), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("course_id", "sequence", name="uq_course_modules_sequence"),
        sa.CheckConstraint("sequence >= 1", name="ck_course_modules_sequence_positive"),
        sa.CheckConstraint(STATUS_VALUES, name="ck_course_modules_status"))
    op.create_index("ix_course_modules_course_id", "course_modules", ["course_id"])
    op.create_index("ix_course_modules_status", "course_modules", ["status"])

    op.create_table("module_lessons",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("module_id", sa.String(36),
                  sa.ForeignKey("course_modules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("module_id", "sequence", name="uq_module_lessons_sequence"),
        sa.CheckConstraint("sequence >= 1", name="ck_module_lessons_sequence_positive"),
        sa.CheckConstraint(STATUS_VALUES, name="ck_module_lessons_status"))
    op.create_index("ix_module_lessons_module_id", "module_lessons", ["module_id"])
    op.create_index("ix_module_lessons_status", "module_lessons", ["status"])

    op.create_table("lesson_objectives",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("lesson_id", sa.String(36),
                  sa.ForeignKey("module_lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(500), nullable=False),
        sa.UniqueConstraint("lesson_id", "sequence", name="uq_lesson_objectives_sequence"),
        sa.CheckConstraint("sequence >= 1", name="ck_lesson_objectives_sequence_positive"))
    op.create_index("ix_lesson_objectives_lesson_id", "lesson_objectives", ["lesson_id"])

    op.create_table("learning_resources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("lesson_id", sa.String(36),
                  sa.ForeignKey("module_lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("external_url", sa.String(2048), nullable=True),
        sa.Column("asset_reference", sa.String(250), nullable=True),
        sa.UniqueConstraint("lesson_id", "sequence", name="uq_learning_resources_sequence"),
        sa.CheckConstraint("sequence >= 1", name="ck_learning_resources_sequence_positive"),
        sa.CheckConstraint("type IN ('external_link', 'reference', 'download_reference')",
                           name="ck_learning_resources_type"))
    op.create_index("ix_learning_resources_lesson_id", "learning_resources", ["lesson_id"])


def downgrade():
    op.drop_index("ix_learning_resources_lesson_id", table_name="learning_resources")
    op.drop_table("learning_resources")
    op.drop_index("ix_lesson_objectives_lesson_id", table_name="lesson_objectives")
    op.drop_table("lesson_objectives")
    op.drop_index("ix_module_lessons_status", table_name="module_lessons")
    op.drop_index("ix_module_lessons_module_id", table_name="module_lessons")
    op.drop_table("module_lessons")
    op.drop_index("ix_course_modules_status", table_name="course_modules")
    op.drop_index("ix_course_modules_course_id", table_name="course_modules")
    op.drop_table("course_modules")
    op.drop_index("ix_courses_status", table_name="courses")
    op.drop_index("ix_courses_code", table_name="courses")
    op.drop_table("courses")
