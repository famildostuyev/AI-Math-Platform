"""add question candidate foundation

Revision ID: 5b02c5057428
Revises: c7e9a1b3d502
Create Date: 2026-08-19 17:42:22.564352

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b02c5057428'
down_revision: Union[str, Sequence[str], None] = 'c7e9a1b3d502'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "question_candidates",
        sa.Column(
            "source_document_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "source_document_page_id",
            sa.UUID(),
            nullable=True,
        ),
        sa.Column(
            "sequence_number",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "extracted_text",
            sa.Text(),
            nullable=False,
        ),
        sa.Column(
            "confidence",
            sa.Numeric(precision=5, scale=4),
            nullable=True,
        ),
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.CheckConstraint(
            "sequence_number > 0",
            name="ck_question_candidates_sequence_positive",
        ),
        sa.CheckConstraint(
            "char_length(btrim(extracted_text)) > 0",
            name="ck_question_candidates_text_nonblank",
        ),
        sa.CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_question_candidates_confidence_range",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["source_documents.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_page_id"],
            ["source_document_pages.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_document_id",
            "sequence_number",
            name="uq_question_candidates_document_sequence",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("question_candidates")
