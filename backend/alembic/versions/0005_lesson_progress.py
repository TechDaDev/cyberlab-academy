"""Add immutable, version-specific lesson completion evidence.

Revision ID: 0005_lesson_progress
Revises: 0004_cohorts_enrollment

Additive: no catalog, cohort, enrollment or account table is altered. Evidence rows are never
updated or deleted, and the foreign keys deliberately have no cascade so a future class delete
cannot erase completed work. Downgrade drops only this table, returning to the 0004 schema.
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_lesson_progress"
down_revision = "0004_cohorts_enrollment"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("lesson_completion_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("enrollment_id", sa.String(36),
                  sa.ForeignKey("cohort_enrollments.id"), nullable=False),
        sa.Column("lesson_id", sa.String(36),
                  sa.ForeignKey("module_lessons.id"), nullable=False),
        sa.Column("lesson_version", sa.Integer(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("enrollment_id", "lesson_id", "lesson_version",
                            name="uq_lesson_completion_events_version"),
        sa.CheckConstraint("lesson_version >= 1", name="ck_lesson_completion_events_version"))
    op.create_index("ix_lesson_completion_events_enrollment_id", "lesson_completion_events",
                    ["enrollment_id"])
    op.create_index("ix_lesson_completion_events_lesson_id", "lesson_completion_events",
                    ["lesson_id"])


def downgrade():
    op.drop_index("ix_lesson_completion_events_lesson_id",
                  table_name="lesson_completion_events")
    op.drop_index("ix_lesson_completion_events_enrollment_id",
                  table_name="lesson_completion_events")
    op.drop_table("lesson_completion_events")
