"""add source document foundation

Revision ID: b4e6f8a0c213
Revises: a2d4f6b8c910
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4e6f8a0c213"
down_revision: Union[str, Sequence[str], None] = "a2d4f6b8c910"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create concrete source-document identities."""

    op.create_table(
        "source_documents",
        sa.Column("media_asset_id", sa.UUID(), nullable=False),
        sa.Column("question_source_id", sa.UUID(), nullable=True),
        sa.Column("uploaded_by_user_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["media_asset_id"],
            ["media_assets.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["question_source_id"],
            ["question_sources.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "media_asset_id",
            name="uq_source_documents_media_asset_id",
        ),
    )
    op.create_index(
        op.f("ix_source_documents_question_source_id"),
        "source_documents",
        ["question_source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_source_documents_uploaded_by_user_id"),
        "source_documents",
        ["uploaded_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove concrete source-document identities."""

    op.drop_index(
        op.f("ix_source_documents_uploaded_by_user_id"),
        table_name="source_documents",
    )
    op.drop_index(
        op.f("ix_source_documents_question_source_id"),
        table_name="source_documents",
    )
    op.drop_table("source_documents")
