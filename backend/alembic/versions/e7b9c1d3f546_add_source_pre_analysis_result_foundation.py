"""add source pre-analysis result foundation

Revision ID: e7b9c1d3f546
Revises: d6a8b0c2e435
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7b9c1d3f546"
down_revision: Union[str, Sequence[str], None] = "d6a8b0c2e435"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create immutable pre-analysis result identities and page summaries."""

    op.create_table(
        "source_pre_analysis_results",
        sa.Column("source_pre_analysis_run_id", sa.UUID(), nullable=False),
        sa.Column(
            "schema_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("page_count", sa.Integer(), nullable=True),
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
            "schema_version > 0",
            name="ck_source_pre_analysis_results_schema_version_positive",
        ),
        sa.CheckConstraint(
            "page_count IS NULL OR page_count >= 0",
            name="ck_source_pre_analysis_results_page_count_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["source_pre_analysis_run_id"],
            ["source_pre_analysis_runs.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_pre_analysis_run_id",
            name="uq_source_pre_analysis_results_run_id",
        ),
    )


def downgrade() -> None:
    """Remove pre-analysis result identities and page summaries."""

    op.drop_table("source_pre_analysis_results")
