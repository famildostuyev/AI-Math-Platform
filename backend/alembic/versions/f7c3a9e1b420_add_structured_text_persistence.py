"""add structured text persistence

Revision ID: f7c3a9e1b420
Revises: e4b8c2d6a710
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "f7c3a9e1b420"
down_revision: Union[str, Sequence[str], None] = "e4b8c2d6a710"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the structured text persistence foundation."""

    op.add_column(
        "text_block_contents",
        sa.Column("document_data", postgresql.JSONB(), nullable=True),
    )
    op.create_check_constraint(
        "ck_text_block_contents_document_data_object_or_null",
        "text_block_contents",
        "document_data IS NULL OR jsonb_typeof(document_data) = 'object'",
    )


def downgrade() -> None:
    """Remove the structured text persistence foundation."""

    op.drop_constraint(
        "ck_text_block_contents_document_data_object_or_null",
        "text_block_contents",
        type_="check",
    )
    op.drop_column("text_block_contents", "document_data")
