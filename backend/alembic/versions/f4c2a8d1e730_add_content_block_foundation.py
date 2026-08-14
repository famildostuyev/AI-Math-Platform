"""add content block foundation

Revision ID: f4c2a8d1e730
Revises: e7b1c9d4a620
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4c2a8d1e730"
down_revision: Union[str, Sequence[str], None] = "e7b1c9d4a620"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the ContentBlock foundation."""

    op.create_table(
        "content_blocks",
        sa.Column("question_revision_id", sa.UUID(), nullable=False),
        sa.Column(
            "block_type",
            sa.Enum(
                "text",
                "formula",
                "image",
                "geometry",
                "graph",
                "table",
                "diagram",
                name="content_block_type",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
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
            "sort_order >= 0",
            name="ck_content_blocks_sort_order_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["question_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_content_blocks_revision_sort_order",
        "content_blocks",
        ["question_revision_id", "sort_order"],
        unique=False,
    )
    op.create_index(
        "uq_content_blocks_active_revision_sort_order",
        "content_blocks",
        ["question_revision_id", "sort_order"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Remove the ContentBlock foundation."""

    op.drop_index(
        "uq_content_blocks_active_revision_sort_order",
        table_name="content_blocks",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        "ix_content_blocks_revision_sort_order",
        table_name="content_blocks",
    )
    op.drop_table("content_blocks")
