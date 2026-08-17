"""add source pre-analysis run foundation

Revision ID: d6a8b0c2e435
Revises: c5f7a9b1d324
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d6a8b0c2e435"
down_revision: Union[str, Sequence[str], None] = "c5f7a9b1d324"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create auditable source pre-analysis run lifecycles."""

    op.create_table(
        "source_pre_analysis_runs",
        sa.Column("source_document_id", sa.UUID(), nullable=False),
        sa.Column("run_number", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "running",
                "succeeded",
                "failed",
                name="source_pre_analysis_run_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("requested_by_user_id", sa.UUID(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_message", sa.Text(), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "run_number > 0",
            name="ck_source_pre_analysis_runs_number_positive",
        ),
        sa.CheckConstraint(
            "(status = 'pending' AND started_at IS NULL "
            "AND completed_at IS NULL AND failure_message IS NULL) "
            "OR (status = 'running' AND started_at IS NOT NULL "
            "AND completed_at IS NULL AND failure_message IS NULL) "
            "OR (status = 'succeeded' AND started_at IS NOT NULL "
            "AND completed_at IS NOT NULL AND failure_message IS NULL) "
            "OR (status = 'failed' AND completed_at IS NOT NULL "
            "AND failure_message IS NOT NULL "
            "AND char_length(btrim(failure_message)) > 0)",
            name="ck_source_pre_analysis_runs_lifecycle_consistent",
        ),
        sa.CheckConstraint(
            "started_at IS NULL OR completed_at IS NULL "
            "OR completed_at >= started_at",
            name="ck_source_pre_analysis_runs_time_order",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["source_documents.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_document_id",
            "run_number",
            name="uq_source_pre_analysis_runs_document_number",
        ),
    )
    op.create_index(
        op.f("ix_source_pre_analysis_runs_requested_by_user_id"),
        "source_pre_analysis_runs",
        ["requested_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove source pre-analysis run lifecycles."""

    op.drop_index(
        op.f("ix_source_pre_analysis_runs_requested_by_user_id"),
        table_name="source_pre_analysis_runs",
    )
    op.drop_table("source_pre_analysis_runs")
