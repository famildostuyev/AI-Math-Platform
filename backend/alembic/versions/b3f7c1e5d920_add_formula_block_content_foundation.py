"""add formula block content foundation

Revision ID: b3f7c1e5d920
Revises: a6d9e2f4b810
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f7c1e5d920"
down_revision: Union[str, Sequence[str], None] = "a6d9e2f4b810"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the FormulaBlockContent foundation."""

    op.create_table(
        "formula_block_contents",
        sa.Column("content_block_id", sa.UUID(), nullable=False),
        sa.Column("source_latex", sa.Text(), nullable=False),
        sa.Column(
            "format_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "format_version > 0",
            name="ck_formula_block_contents_format_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["content_block_id"],
            ["content_blocks.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("content_block_id"),
    )


def downgrade() -> None:
    """Remove the FormulaBlockContent foundation."""

    op.drop_table("formula_block_contents")
