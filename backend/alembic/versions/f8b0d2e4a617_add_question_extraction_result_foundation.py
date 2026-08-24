"""add question extraction result foundation

Revision ID: f8b0d2e4a617
Revises: e6a8c0d2f415
Create Date: 2026-08-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8b0d2e4a617"
down_revision: Union[str, Sequence[str], None] = "e6a8c0d2f415"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create immutable question extraction result provenance."""
    op.create_table(
        "question_extraction_results",
        sa.Column("question_extraction_run_id", sa.UUID(), nullable=False),
        sa.Column(
            "schema_version", sa.Integer(),
            server_default=sa.text("1"), nullable=False,
        ),
        sa.Column("processor_name", sa.String(length=100), nullable=False),
        sa.Column("processor_version", sa.String(length=100), nullable=False),
        sa.Column("provider_name", sa.String(length=100), nullable=True),
        sa.Column("model_name", sa.String(length=200), nullable=True),
        sa.Column("prompt_version", sa.String(length=100), nullable=True),
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
            "schema_version > 0",
            name="ck_question_extraction_results_schema_version_positive",
        ),
        sa.CheckConstraint(
            "char_length(btrim(processor_name)) > 0",
            name="ck_question_extraction_results_processor_name_nonblank",
        ),
        sa.CheckConstraint(
            "char_length(btrim(processor_version)) > 0",
            name="ck_question_extraction_results_processor_version_nonblank",
        ),
        sa.CheckConstraint(
            "provider_name IS NULL OR char_length(btrim(provider_name)) > 0",
            name="ck_question_extraction_results_provider_name_nonblank",
        ),
        sa.CheckConstraint(
            "model_name IS NULL OR char_length(btrim(model_name)) > 0",
            name="ck_question_extraction_results_model_name_nonblank",
        ),
        sa.CheckConstraint(
            "prompt_version IS NULL OR char_length(btrim(prompt_version)) > 0",
            name="ck_question_extraction_results_prompt_version_nonblank",
        ),
        sa.ForeignKeyConstraint(
            ["question_extraction_run_id"], ["question_extraction_runs.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_extraction_run_id",
            name="uq_question_extraction_results_run_id",
        ),
    )


def downgrade() -> None:
    """Remove question extraction result provenance."""
    op.drop_table("question_extraction_results")
