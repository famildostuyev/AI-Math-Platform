"""add geometry block content foundation

Revision ID: e4b8c2d6a710
Revises: d1a5e8c2f940
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e4b8c2d6a710"
down_revision: Union[str, Sequence[str], None] = "d1a5e8c2f940"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the GeometryBlockContent foundation."""

    op.create_table(
        "geometry_block_contents",
        sa.Column("content_block_id", sa.UUID(), nullable=False),
        sa.Column("source_data", postgresql.JSONB(), nullable=False),
        sa.Column(
            "format_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "format_version > 0",
            name="ck_geometry_block_contents_format_version_positive",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(source_data) = 'object'",
            name="ck_geometry_block_contents_source_data_object",
        ),
        sa.ForeignKeyConstraint(
            ["content_block_id"],
            ["content_blocks.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("content_block_id"),
    )


def downgrade() -> None:
    """Remove the GeometryBlockContent foundation."""

    op.drop_table("geometry_block_contents")
