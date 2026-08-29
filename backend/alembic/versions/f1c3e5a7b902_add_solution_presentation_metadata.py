"""Add semantic presentation metadata to canonical solution blocks.

Revision ID: f1c3e5a7b902
Revises: e9f1b3c5d746
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1c3e5a7b902"
down_revision: Union[str, Sequence[str], None] = "e9f1b3c5d746"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("solution_blocks", sa.Column("step_index", sa.Integer(), nullable=True))
    op.add_column(
        "solution_blocks",
        sa.Column("presentation_role", sa.String(length=32), server_default="reasoning", nullable=False),
    )
    op.create_check_constraint(
        "ck_solution_blocks_step_index_positive",
        "solution_blocks",
        "step_index IS NULL OR step_index > 0",
    )
    op.create_check_constraint(
        "solution_presentation_role",
        "solution_blocks",
        "presentation_role IN ('reasoning', 'governing_formula', 'result', 'final_answer', "
        "'verification', 'note', 'property')",
    )


def downgrade() -> None:
    op.drop_constraint("solution_presentation_role", "solution_blocks", type_="check")
    op.drop_constraint("ck_solution_blocks_step_index_positive", "solution_blocks", type_="check")
    op.drop_column("solution_blocks", "presentation_role")
    op.drop_column("solution_blocks", "step_index")
