"""add image block content foundation

Revision ID: d1a5e8c2f940
Revises: c9e2a4f6b731
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1a5e8c2f940"
down_revision: Union[str, Sequence[str], None] = "c9e2a4f6b731"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the ImageBlockContent foundation."""

    op.create_table(
        "image_block_contents",
        sa.Column("content_block_id", sa.UUID(), nullable=False),
        sa.Column("media_asset_id", sa.UUID(), nullable=False),
        sa.Column("alt_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["content_block_id"],
            ["content_blocks.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["media_asset_id"],
            ["media_assets.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("content_block_id"),
    )
    op.create_index(
        "ix_image_block_contents_media_asset_id",
        "image_block_contents",
        ["media_asset_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the ImageBlockContent foundation."""

    op.drop_index(
        "ix_image_block_contents_media_asset_id",
        table_name="image_block_contents",
    )
    op.drop_table("image_block_contents")
