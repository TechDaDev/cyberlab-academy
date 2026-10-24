"""Make active roles session-scoped and add account security records.

Revision ID: 0002_account_security
Revises: 0001_accounts
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_account_security"
down_revision = "0001_accounts"
branch_labels = None
depends_on = None

role_enum = sa.Enum("student", "instructor", "manager", "administrator", name="role")


def upgrade():
    op.add_column("sessions", sa.Column("active_role", role_enum, nullable=True))
    op.execute("UPDATE sessions SET active_role = (SELECT active_role FROM users WHERE users.id = sessions.user_id)")
    op.add_column("sessions", sa.Column("authenticated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE sessions SET authenticated_at = CURRENT_TIMESTAMP")
    op.add_column("sessions", sa.Column("mfa_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sessions", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE sessions SET created_at = authenticated_at")
    with op.batch_alter_table("sessions") as batch:
        batch.alter_column("active_role", nullable=False)
        batch.alter_column("authenticated_at", nullable=False)
        batch.alter_column("created_at", nullable=False)
    with op.batch_alter_table("users") as batch:
        batch.drop_column("active_role")

    op.add_column("instructor_requests", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("instructor_requests", sa.Column("decided_by", sa.String(36), nullable=True))
    op.add_column("instructor_requests", sa.Column("reason", sa.String(500), nullable=False, server_default=""))

    op.create_table("one_time_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("token_digest", sa.String(64), nullable=False),
        sa.Column("target_email", sa.String(320), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_one_time_tokens_user_id", "one_time_tokens", ["user_id"])
    op.create_index("ix_one_time_tokens_kind", "one_time_tokens", ["kind"])
    op.create_index("ix_one_time_tokens_token_digest", "one_time_tokens", ["token_digest"], unique=True)

    op.create_table("mfa_enrollments",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("secret_encrypted", sa.String(512), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("last_counter", sa.Integer(), nullable=False))
    op.create_table("mfa_recovery_codes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_mfa_recovery_codes_user_id", "mfa_recovery_codes", ["user_id"])
    op.create_table("rate_limit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key_digest", sa.String(64), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_rate_limit_events_key_digest", "rate_limit_events", ["key_digest"])
    op.create_index("ix_rate_limit_events_action", "rate_limit_events", ["action"])


def downgrade():
    op.drop_index("ix_rate_limit_events_action", table_name="rate_limit_events")
    op.drop_index("ix_rate_limit_events_key_digest", table_name="rate_limit_events")
    op.drop_table("rate_limit_events")
    op.drop_index("ix_mfa_recovery_codes_user_id", table_name="mfa_recovery_codes")
    op.drop_table("mfa_recovery_codes")
    op.drop_table("mfa_enrollments")
    op.drop_index("ix_one_time_tokens_token_digest", table_name="one_time_tokens")
    op.drop_index("ix_one_time_tokens_kind", table_name="one_time_tokens")
    op.drop_index("ix_one_time_tokens_user_id", table_name="one_time_tokens")
    op.drop_table("one_time_tokens")
    op.drop_column("instructor_requests", "reason")
    op.drop_column("instructor_requests", "decided_by")
    op.drop_column("instructor_requests", "decided_at")
    op.add_column("users", sa.Column("active_role", role_enum, nullable=False, server_default="student"))
    with op.batch_alter_table("sessions") as batch:
        batch.drop_column("created_at")
        batch.drop_column("mfa_verified_at")
        batch.drop_column("authenticated_at")
        batch.drop_column("active_role")
