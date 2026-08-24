"""add question extraction run timestamp defaults

Revision ID: c4e6a8b0d213
Revises: 9b5165810c21
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4e6a8b0d213"
down_revision: Union[str, Sequence[str], None] = "9b5165810c21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the BaseModel timestamp defaults omitted by the foundation migration."""
    op.alter_column(
        "question_extraction_runs",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("now()"),
    )
    op.alter_column(
        "question_extraction_runs",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=sa.text("now()"),
    )


def downgrade() -> None:
    """Remove the question extraction run timestamp defaults."""
    op.alter_column(
        "question_extraction_runs",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
    op.alter_column(
        "question_extraction_runs",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
        server_default=None,
    )
