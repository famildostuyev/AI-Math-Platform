"""add text block content foundation

Revision ID: a6d9e2f4b810
Revises: f4c2a8d1e730
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a6d9e2f4b810"
down_revision: Union[str, Sequence[str], None] = "f4c2a8d1e730"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the TextBlockContent foundation."""

    op.create_table(
        "text_block_contents",
        sa.Column("content_block_id", sa.UUID(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column(
            "format_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "format_version > 0",
            name="ck_text_block_contents_format_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["content_block_id"],
            ["content_blocks.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("content_block_id"),
    )


def downgrade() -> None:
    """Remove the TextBlockContent foundation."""

    op.drop_table("text_block_contents")
