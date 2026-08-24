"""add question candidate timestamp defaults

Revision ID: e6a8c0d2f415
Revises: c4e6a8b0d213
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6a8c0d2f415"
down_revision: Union[str, Sequence[str], None] = "c4e6a8b0d213"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the BaseModel timestamp defaults omitted by the foundation migration."""
    op.alter_column(
        "question_candidates",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("now()"),
    )
    op.alter_column(
        "question_candidates",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("now()"),
    )


def downgrade() -> None:
    """Remove the question candidate timestamp defaults."""
    op.alter_column(
        "question_candidates",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
    op.alter_column(
        "question_candidates",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
