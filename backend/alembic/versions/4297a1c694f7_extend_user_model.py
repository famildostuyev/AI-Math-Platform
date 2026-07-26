"""extend user model

Revision ID: 4297a1c694f7
Revises: d2ce57074bc7
Create Date: 2026-07-24 02:10:49.022176
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4297a1c694f7"
down_revision: Union[str, Sequence[str], None] = "d2ce57074bc7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users",
        sa.Column(
            "is_email_verified",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "is_phone_verified",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "last_active_role_id",
            sa.UUID(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_users_last_active_role_id_roles",
        "users",
        "roles",
        ["last_active_role_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_users_last_active_role_id",
        "users",
        ["last_active_role_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_users_last_active_role_id",
        table_name="users",
    )

    op.drop_constraint(
        "fk_users_last_active_role_id_roles",
        "users",
        type_="foreignkey",
    )

    op.drop_column("users", "last_active_role_id")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "is_phone_verified")
    op.drop_column("users", "is_email_verified")