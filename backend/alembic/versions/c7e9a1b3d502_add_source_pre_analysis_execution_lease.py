"""add source pre-analysis execution lease

Revision ID: c7e9a1b3d502
Revises: b3d5f7a9c241
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e9a1b3d502"
down_revision: Union[str, Sequence[str], None] = "b3d5f7a9c241"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "source_pre_analysis_runs"
LIFECYCLE_CONSTRAINT = "ck_source_pre_analysis_runs_lifecycle_consistent"
HEARTBEAT_ORDER_CONSTRAINT = "ck_source_pre_analysis_runs_heartbeat_order"
RECOVERY_INDEX = "ix_source_pre_analysis_runs_recovery"
INTERRUPTION_MESSAGE = (
    "Pre-analysis execution was interrupted before completion."
)

OLD_LIFECYCLE_CONDITION = (
    "(status = 'pending' AND started_at IS NULL "
    "AND completed_at IS NULL AND failure_message IS NULL) "
    "OR (status = 'running' AND started_at IS NOT NULL "
    "AND completed_at IS NULL AND failure_message IS NULL) "
    "OR (status = 'succeeded' AND started_at IS NOT NULL "
    "AND completed_at IS NOT NULL AND failure_message IS NULL) "
    "OR (status = 'failed' AND completed_at IS NOT NULL "
    "AND failure_message IS NOT NULL "
    "AND char_length(btrim(failure_message)) > 0)"
)
LEASE_LIFECYCLE_CONDITION = (
    "(status = 'pending' AND started_at IS NULL "
    "AND completed_at IS NULL AND failure_message IS NULL "
    "AND execution_lease_id IS NULL "
    "AND last_heartbeat_at IS NULL) "
    "OR (status = 'running' AND started_at IS NOT NULL "
    "AND completed_at IS NULL AND failure_message IS NULL "
    "AND execution_lease_id IS NOT NULL "
    "AND last_heartbeat_at IS NOT NULL) "
    "OR (status = 'succeeded' AND started_at IS NOT NULL "
    "AND completed_at IS NOT NULL AND failure_message IS NULL "
    "AND execution_lease_id IS NULL "
    "AND last_heartbeat_at IS NULL) "
    "OR (status = 'failed' AND completed_at IS NOT NULL "
    "AND failure_message IS NOT NULL "
    "AND char_length(btrim(failure_message)) > 0 "
    "AND execution_lease_id IS NULL "
    "AND last_heartbeat_at IS NULL)"
)
HEARTBEAT_ORDER_CONDITION = (
    "last_heartbeat_at IS NULL OR "
    "(started_at IS NOT NULL AND last_heartbeat_at >= started_at)"
)


def upgrade() -> None:
    """Add active execution ownership and reconcile unowned running rows."""

    op.add_column(
        TABLE_NAME,
        sa.Column("execution_lease_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        TABLE_NAME,
        sa.Column(
            "last_heartbeat_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            "UPDATE source_pre_analysis_runs "
            "SET status = 'failed', completed_at = CURRENT_TIMESTAMP, "
            "failure_message = :failure_message "
            "WHERE status = 'running'"
        ).bindparams(failure_message=INTERRUPTION_MESSAGE)
    )
    op.drop_constraint(
        LIFECYCLE_CONSTRAINT,
        TABLE_NAME,
        type_="check",
    )
    op.create_check_constraint(
        LIFECYCLE_CONSTRAINT,
        TABLE_NAME,
        LEASE_LIFECYCLE_CONDITION,
    )
    op.create_check_constraint(
        HEARTBEAT_ORDER_CONSTRAINT,
        TABLE_NAME,
        HEARTBEAT_ORDER_CONDITION,
    )
    op.create_index(
        RECOVERY_INDEX,
        TABLE_NAME,
        ["status", "deleted_at", "last_heartbeat_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove active execution ownership while preserving terminal history."""

    op.drop_index(RECOVERY_INDEX, table_name=TABLE_NAME)
    op.drop_constraint(
        HEARTBEAT_ORDER_CONSTRAINT,
        TABLE_NAME,
        type_="check",
    )
    op.drop_constraint(
        LIFECYCLE_CONSTRAINT,
        TABLE_NAME,
        type_="check",
    )
    op.create_check_constraint(
        LIFECYCLE_CONSTRAINT,
        TABLE_NAME,
        OLD_LIFECYCLE_CONDITION,
    )
    op.drop_column(TABLE_NAME, "last_heartbeat_at")
    op.drop_column(TABLE_NAME, "execution_lease_id")
