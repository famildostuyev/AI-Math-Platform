"""add source document page foundation

Revision ID: c5f7a9b1d324
Revises: b4e6f8a0c213
Create Date: 2026-08-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c5f7a9b1d324"
down_revision: Union[str, Sequence[str], None] = "b4e6f8a0c213"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create stable source-document page identities."""

    op.create_table(
        "source_document_pages",
        sa.Column("source_document_id", sa.UUID(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
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
            "page_number > 0",
            name="ck_source_document_pages_number_positive",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["source_documents.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_document_id",
            "page_number",
            name="uq_source_document_pages_document_number",
        ),
    )


def downgrade() -> None:
    """Remove source-document page identities."""

    op.drop_table("source_document_pages")
