"""add question source metadata

Revision ID: a2d4f6b8c910
Revises: f7c3a9e1b420
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2d4f6b8c910"
down_revision: Union[str, Sequence[str], None] = "f7c3a9e1b420"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add reusable question sources and optional form-level metadata."""

    op.create_table(
        "question_sources",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "sort_order", sa.Integer(), server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_question_sources_name"), "question_sources", ["name"],
        unique=True,
    )
    op.add_column(
        "question_forms", sa.Column("source_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "question_forms", sa.Column("source_detail", sa.Text(), nullable=True),
    )
    op.create_index(
        op.f("ix_question_forms_source_id"), "question_forms", ["source_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_question_forms_source_id_question_sources",
        "question_forms", "question_sources", ["source_id"], ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Remove form-level source metadata and the source catalog."""

    op.drop_constraint(
        "fk_question_forms_source_id_question_sources", "question_forms",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_question_forms_source_id"), table_name="question_forms",
    )
    op.drop_column("question_forms", "source_detail")
    op.drop_column("question_forms", "source_id")
    op.drop_index(
        op.f("ix_question_sources_name"), table_name="question_sources",
    )
    op.drop_table("question_sources")
