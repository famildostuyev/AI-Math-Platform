"""add user name fields

Revision ID: 92a8355b6004
Revises: 6e51856085e1
Create Date: 2026-07-27 11:33:55.838626
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "92a8355b6004"
down_revision: Union[str, Sequence[str], None] = "6e51856085e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable columns
    op.add_column(
        "users",
        sa.Column("first_name", sa.String(length=100), nullable=True),
    )

    op.add_column(
        "users",
        sa.Column("last_name", sa.String(length=100), nullable=True),
    )

    # 2. Populate existing rows
    op.execute(
        """
        UPDATE users
        SET first_name = 'Unknown',
            last_name = 'User'
        WHERE first_name IS NULL
           OR last_name IS NULL
        """
    )

    # 3. Enforce NOT NULL
    op.alter_column(
        "users",
        "first_name",
        nullable=False,
    )

    op.alter_column(
        "users",
        "last_name",
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")