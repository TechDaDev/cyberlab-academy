"""Create classes (cohorts), instructor assignments and student enrollments.

Revision ID: 0004_cohorts_enrollment
Revises: 0003_academic_catalog

Additive only: catalog and account tables are untouched, so accepted Milestone 02A data stays
valid. Removals are soft (``removed_at`` / status), so membership history survives for the
Milestone 02C progress model; only deleting a class cascades to its own membership rows.
Lifecycle state is a bounded string with a CHECK constraint, matching the catalog tables.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_cohorts_enrollment"
down_revision = "0003_academic_catalog"
branch_labels = None
depends_on = None

COHORT_STATUS = "status IN ('draft', 'active', 'completed', 'archived')"
ENROLLMENT_STATUS = "status IN ('active', 'withdrawn')"


def upgrade():
    op.create_table("course_cohorts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("course_id", sa.String(36), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "code", name="uq_course_cohorts_code"),
        sa.CheckConstraint(COHORT_STATUS, name="ck_course_cohorts_status"),
        sa.CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
                           name="ck_course_cohorts_dates"))
    op.create_index("ix_course_cohorts_course_id", "course_cohorts", ["course_id"])
    op.create_index("ix_course_cohorts_status", "course_cohorts", ["status"])

    op.create_table("cohort_instructors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cohort_id", sa.String(36),
                  sa.ForeignKey("course_cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("instructor_user_id", sa.String(36),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_by", sa.String(36), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("cohort_id", "instructor_user_id",
                            name="uq_cohort_instructors_assignment"))
    op.create_index("ix_cohort_instructors_cohort_id", "cohort_instructors", ["cohort_id"])
    op.create_index("ix_cohort_instructors_instructor_user_id", "cohort_instructors",
                    ["instructor_user_id"])

    op.create_table("cohort_enrollments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cohort_id", sa.String(36),
                  sa.ForeignKey("course_cohorts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("enrolled_by", sa.String(36), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("cohort_id", "student_user_id", name="uq_cohort_enrollments_student"),
        sa.CheckConstraint(ENROLLMENT_STATUS, name="ck_cohort_enrollments_status"))
    op.create_index("ix_cohort_enrollments_cohort_id", "cohort_enrollments", ["cohort_id"])
    op.create_index("ix_cohort_enrollments_student_user_id", "cohort_enrollments",
                    ["student_user_id"])
    op.create_index("ix_cohort_enrollments_status", "cohort_enrollments", ["status"])


def downgrade():
    op.drop_index("ix_cohort_enrollments_status", table_name="cohort_enrollments")
    op.drop_index("ix_cohort_enrollments_student_user_id", table_name="cohort_enrollments")
    op.drop_index("ix_cohort_enrollments_cohort_id", table_name="cohort_enrollments")
    op.drop_table("cohort_enrollments")
    op.drop_index("ix_cohort_instructors_instructor_user_id", table_name="cohort_instructors")
    op.drop_index("ix_cohort_instructors_cohort_id", table_name="cohort_instructors")
    op.drop_table("cohort_instructors")
    op.drop_index("ix_course_cohorts_status", table_name="course_cohorts")
    op.drop_index("ix_course_cohorts_course_id", table_name="course_cohorts")
    op.drop_table("course_cohorts")
