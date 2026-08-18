"""add source pre-analysis processor provenance

Revision ID: b3d5f7a9c241
Revises: f2a4c6e8b013
Create Date: 2026-08-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3d5f7a9c241"
down_revision: Union[str, Sequence[str], None] = "f2a4c6e8b013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_NAME = "source_pre_analysis_results"


def upgrade() -> None:
    """Add nullable, legacy-compatible processor provenance identifiers."""

    op.add_column(
        TABLE_NAME,
        sa.Column("processor_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        TABLE_NAME,
        sa.Column("processor_version", sa.String(length=100), nullable=True),
    )
    op.add_column(
        TABLE_NAME,
        sa.Column("provider_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        TABLE_NAME,
        sa.Column("model_name", sa.String(length=200), nullable=True),
    )
    op.add_column(
        TABLE_NAME,
        sa.Column("prompt_version", sa.String(length=100), nullable=True),
    )

    constraints = {
        "ck_source_pre_analysis_results_processor_identity_paired": (
            "(processor_name IS NULL AND processor_version IS NULL) OR "
            "(processor_name IS NOT NULL AND processor_version IS NOT NULL)"
        ),
        "ck_source_pre_analysis_results_processor_name_nonblank": (
            "processor_name IS NULL OR "
            "char_length(btrim(processor_name)) > 0"
        ),
        "ck_source_pre_analysis_results_processor_version_nonblank": (
            "processor_version IS NULL OR "
            "char_length(btrim(processor_version)) > 0"
        ),
        "ck_source_pre_analysis_results_provider_name_nonblank": (
            "provider_name IS NULL OR "
            "char_length(btrim(provider_name)) > 0"
        ),
        "ck_source_pre_analysis_results_model_name_nonblank": (
            "model_name IS NULL OR char_length(btrim(model_name)) > 0"
        ),
        "ck_source_pre_analysis_results_prompt_version_nonblank": (
            "prompt_version IS NULL OR "
            "char_length(btrim(prompt_version)) > 0"
        ),
    }
    for constraint_name, condition in constraints.items():
        op.create_check_constraint(
            constraint_name,
            TABLE_NAME,
            condition,
        )


def downgrade() -> None:
    """Remove only processor provenance constraints and columns."""

    for constraint_name in (
        "ck_source_pre_analysis_results_prompt_version_nonblank",
        "ck_source_pre_analysis_results_model_name_nonblank",
        "ck_source_pre_analysis_results_provider_name_nonblank",
        "ck_source_pre_analysis_results_processor_version_nonblank",
        "ck_source_pre_analysis_results_processor_name_nonblank",
        "ck_source_pre_analysis_results_processor_identity_paired",
    ):
        op.drop_constraint(
            constraint_name,
            TABLE_NAME,
            type_="check",
        )

    for column_name in (
        "prompt_version",
        "model_name",
        "provider_name",
        "processor_version",
        "processor_name",
    ):
        op.drop_column(TABLE_NAME, column_name)
