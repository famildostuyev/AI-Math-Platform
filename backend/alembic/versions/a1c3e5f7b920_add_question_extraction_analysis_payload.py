"""add question extraction analysis payload

Revision ID: a1c3e5f7b920
Revises: f8b0d2e4a617
Create Date: 2026-08-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1c3e5f7b920"
down_revision: Union[str, Sequence[str], None] = "f8b0d2e4a617"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "question_extraction_results",
        sa.Column("processing_version", sa.String(length=100),
                  server_default=sa.text("'1'"), nullable=False),
    )
    op.add_column(
        "question_extraction_results",
        sa.Column("analysis_data", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.create_check_constraint(
        "ck_question_extraction_results_processing_version_nonblank",
        "question_extraction_results",
        "char_length(btrim(processing_version)) > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_question_extraction_results_processing_version_nonblank",
        "question_extraction_results",
        type_="check",
    )
    op.drop_column("question_extraction_results", "analysis_data")
    op.drop_column("question_extraction_results", "processing_version")
