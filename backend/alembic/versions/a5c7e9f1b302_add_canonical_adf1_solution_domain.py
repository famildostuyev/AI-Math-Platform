"""Add canonical ADF-1 solution domain.

Revision ID: a5c7e9f1b302
Revises: f3a5c7d9e120
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a5c7e9f1b302"
down_revision: Union[str, Sequence[str], None] = "f3a5c7d9e120"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _base_columns() -> tuple[sa.Column, ...]:
    return (
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def upgrade() -> None:
    op.create_table(
        "solutions",
        sa.Column("question_revision_id", sa.UUID(), nullable=False),
        *_base_columns(),
        sa.ForeignKeyConstraint(["question_revision_id"], ["question_revisions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_solutions_question_revision_id"), "solutions", ["question_revision_id"])
    op.create_index(
        "uq_solutions_active_revision", "solutions", ["question_revision_id"],
        unique=True, postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "solution_blocks",
        sa.Column("solution_id", sa.UUID(), nullable=False),
        sa.Column("block_type", sa.Enum("text", "formula", name="solution_block_type", native_enum=False, create_constraint=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column("document_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_latex", sa.Text(), nullable=True),
        sa.Column("format_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        *_base_columns(),
        sa.CheckConstraint("sort_order > 0", name="ck_solution_blocks_sort_order_positive"),
        sa.CheckConstraint("format_version > 0", name="ck_solution_blocks_format_version_positive"),
        sa.CheckConstraint("document_data IS NULL OR jsonb_typeof(document_data) = 'object'", name="ck_solution_blocks_document_data_object_or_null"),
        sa.CheckConstraint(
            "(block_type = 'text' AND source_text IS NOT NULL AND document_data IS NOT NULL AND source_latex IS NULL) OR "
            "(block_type = 'formula' AND source_text IS NULL AND document_data IS NULL AND source_latex IS NOT NULL)",
            name="ck_solution_blocks_payload_matches_type",
        ),
        sa.ForeignKeyConstraint(["solution_id"], ["solutions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_solution_blocks_solution_id"), "solution_blocks", ["solution_id"])
    op.create_index("ix_solution_blocks_solution_sort_order", "solution_blocks", ["solution_id", "sort_order"])
    op.create_index(
        "uq_solution_blocks_active_solution_order", "solution_blocks", ["solution_id", "sort_order"],
        unique=True, postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_solution_blocks_active_solution_order", table_name="solution_blocks")
    op.drop_index("ix_solution_blocks_solution_sort_order", table_name="solution_blocks")
    op.drop_index(op.f("ix_solution_blocks_solution_id"), table_name="solution_blocks")
    op.drop_table("solution_blocks")
    op.drop_index("uq_solutions_active_revision", table_name="solutions")
    op.drop_index(op.f("ix_solutions_question_revision_id"), table_name="solutions")
    op.drop_table("solutions")
