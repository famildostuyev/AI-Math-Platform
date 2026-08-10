"""add user sessions

Revision ID: 6e51856085e1
Revises: 4297a1c694f7
Create Date: 2026-07-26 17:08:18.763397
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6e51856085e1"
down_revision: Union[str, Sequence[str], None] = "4297a1c694f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column(
            "refresh_token_hash",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column("parent_session_id", sa.UUID(), nullable=True),
        sa.Column("replaced_by_session_id", sa.UUID(), nullable=True),
        sa.Column(
            "rotation_counter",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "revocation_reason",
            sa.String(length=100),
            nullable=True,
        ),
        sa.Column(
            "reuse_detected_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_ip_address",
            sa.String(length=45),
            nullable=True,
        ),
        sa.Column(
            "last_used_ip_address",
            sa.String(length=45),
            nullable=True,
        ),
        sa.Column(
            "user_agent",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "device_name",
            sa.String(length=150),
            nullable=True,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.CheckConstraint(
            "expires_at > issued_at",
            name="ck_user_sessions_expiry_after_issue",
        ),
        sa.CheckConstraint(
            "rotation_counter >= 0",
            name="ck_user_sessions_rotation_counter_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["parent_session_id"],
            ["user_sessions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["replaced_by_session_id"],
            ["user_sessions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_user_sessions_expires_at",
        "user_sessions",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_family_id"),
        "user_sessions",
        ["family_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_sessions_family_id_revoked_at",
        "user_sessions",
        ["family_id", "revoked_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_parent_session_id"),
        "user_sessions",
        ["parent_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_refresh_token_hash"),
        "user_sessions",
        ["refresh_token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_user_sessions_replaced_by_session_id"),
        "user_sessions",
        ["replaced_by_session_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_revoked_at"),
        "user_sessions",
        ["revoked_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_sessions_user_id"),
        "user_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_sessions_user_id_family_id",
        "user_sessions",
        ["user_id", "family_id"],
        unique=False,
    )
    op.create_index(
        "ix_user_sessions_user_id_revoked_at",
        "user_sessions",
        ["user_id", "revoked_at"],
        unique=False,
    )

    op.add_column(
        "users",
        sa.Column(
            "password_changed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "failed_login_attempts",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_attempts")
    op.drop_column("users", "password_changed_at")

    op.drop_index(
        "ix_user_sessions_user_id_revoked_at",
        table_name="user_sessions",
    )
    op.drop_index(
        "ix_user_sessions_user_id_family_id",
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_user_id"),
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_revoked_at"),
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_replaced_by_session_id"),
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_refresh_token_hash"),
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_parent_session_id"),
        table_name="user_sessions",
    )
    op.drop_index(
        "ix_user_sessions_family_id_revoked_at",
        table_name="user_sessions",
    )
    op.drop_index(
        op.f("ix_user_sessions_family_id"),
        table_name="user_sessions",
    )
    op.drop_index(
        "ix_user_sessions_expires_at",
        table_name="user_sessions",
    )

    op.drop_table("user_sessions")