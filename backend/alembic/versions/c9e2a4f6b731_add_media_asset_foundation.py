"""add media asset foundation

Revision ID: c9e2a4f6b731
Revises: b3f7c1e5d920
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9e2a4f6b731"
down_revision: Union[str, Sequence[str], None] = "b3f7c1e5d920"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the MediaAsset foundation."""

    op.create_table(
        "media_assets",
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_media_assets_storage_key_not_blank",
        ),
        sa.CheckConstraint(
            "char_length(btrim(mime_type)) > 0",
            name="ck_media_assets_mime_type_not_blank",
        ),
        sa.CheckConstraint(
            "size_bytes > 0",
            name="ck_media_assets_size_bytes_positive",
        ),
        sa.CheckConstraint(
            "char_length(sha256) = 64",
            name="ck_media_assets_sha256_length",
        ),
        sa.CheckConstraint(
            "width_px IS NULL OR width_px > 0",
            name="ck_media_assets_width_px_positive",
        ),
        sa.CheckConstraint(
            "height_px IS NULL OR height_px > 0",
            name="ck_media_assets_height_px_positive",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )


def downgrade() -> None:
    """Remove the MediaAsset foundation."""

    op.drop_table("media_assets")
