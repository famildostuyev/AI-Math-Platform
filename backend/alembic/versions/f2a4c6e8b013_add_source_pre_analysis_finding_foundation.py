"""add source pre-analysis finding foundation

Revision ID: f2a4c6e8b013
Revises: e7b9c1d3f546
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a4c6e8b013"
down_revision: Union[str, Sequence[str], None] = "e7b9c1d3f546"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create immutable observations for pre-analysis results."""

    op.create_table(
        "source_pre_analysis_findings",
        sa.Column("source_pre_analysis_result_id", sa.UUID(), nullable=False),
        sa.Column("source_document_page_id", sa.UUID(), nullable=True),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("finding_code", sa.String(length=100), nullable=False),
        sa.Column(
            "severity",
            sa.Enum(
                "info", "warning", "error",
                name="source_pre_analysis_finding_severity",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("confidence", sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "sequence_number > 0",
            name="ck_source_pre_analysis_findings_sequence_positive",
        ),
        sa.CheckConstraint(
            "char_length(btrim(finding_code)) > 0",
            name="ck_source_pre_analysis_findings_code_nonblank",
        ),
        sa.CheckConstraint(
            "char_length(btrim(message)) > 0",
            name="ck_source_pre_analysis_findings_message_nonblank",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_source_pre_analysis_findings_confidence_range",
        ),
        sa.ForeignKeyConstraint(
            ["source_pre_analysis_result_id"],
            ["source_pre_analysis_results.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_page_id"],
            ["source_document_pages.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_pre_analysis_result_id", "sequence_number",
            name="uq_source_pre_analysis_findings_result_sequence",
        ),
    )
    op.create_index(
        "ix_source_pre_analysis_findings_source_document_page_id",
        "source_pre_analysis_findings",
        ["source_document_page_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove pre-analysis findings only."""

    op.drop_index(
        "ix_source_pre_analysis_findings_source_document_page_id",
        table_name="source_pre_analysis_findings",
    )
    op.drop_table("source_pre_analysis_findings")
