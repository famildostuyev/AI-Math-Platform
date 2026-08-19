"""link question candidates to extraction runs

Revision ID: 9b5165810c21
Revises: 6047b7650712
Create Date: 2026-08-19 23:02:09.445898

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b5165810c21'
down_revision: Union[str, Sequence[str], None] = '6047b7650712'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        sa.text(
            "DO $$ "
            "BEGIN "
            "IF EXISTS (SELECT 1 FROM question_candidates LIMIT 1) THEN "
            "RAISE EXCEPTION "
            "'question_candidates must be empty before linking candidates to extraction runs'; "
            "END IF; "
            "END $$;"
        )
    )

    op.drop_constraint(
        "uq_question_candidates_document_sequence",
        "question_candidates",
        type_="unique",
    )
    op.drop_constraint(
        "question_candidates_source_document_id_fkey",
        "question_candidates",
        type_="foreignkey",
    )

    op.add_column(
        "question_candidates",
        sa.Column("question_extraction_run_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "question_candidates_question_extraction_run_id_fkey",
        "question_candidates",
        "question_extraction_runs",
        ["question_extraction_run_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        "uq_question_candidates_run_sequence",
        "question_candidates",
        ["question_extraction_run_id", "sequence_number"],
    )
    op.alter_column(
        "question_candidates",
        "question_extraction_run_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
    op.drop_column("question_candidates", "source_document_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        sa.text(
            "DO $$ "
            "BEGIN "
            "IF EXISTS (SELECT 1 FROM question_candidates LIMIT 1) THEN "
            "RAISE EXCEPTION "
            "'question_candidates must be empty before restoring document linkage'; "
            "END IF; "
            "END $$;"
        )
    )

    op.add_column(
        "question_candidates",
        sa.Column("source_document_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "question_candidates_source_document_id_fkey",
        "question_candidates",
        "source_documents",
        ["source_document_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        "uq_question_candidates_document_sequence",
        "question_candidates",
        ["source_document_id", "sequence_number"],
    )
    op.alter_column(
        "question_candidates",
        "source_document_id",
        existing_type=sa.UUID(),
        nullable=False,
    )

    op.drop_constraint(
        "uq_question_candidates_run_sequence",
        "question_candidates",
        type_="unique",
    )
    op.drop_constraint(
        "question_candidates_question_extraction_run_id_fkey",
        "question_candidates",
        type_="foreignkey",
    )
    op.drop_column("question_candidates", "question_extraction_run_id")
