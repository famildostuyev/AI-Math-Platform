"""link AI authoring proposals to request messages

Revision ID: d9f1b3c5e706
Revises: c7e9a1b3d504
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9f1b3c5e706"
down_revision: Union[str, Sequence[str], None] = "c7e9a1b3d504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_authoring_proposals",
        sa.Column("request_message_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_authoring_proposals_request_message_id",
        "ai_authoring_proposals",
        "ai_authoring_messages",
        ["request_message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_ai_authoring_proposals_request_message_id"),
        "ai_authoring_proposals",
        ["request_message_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_authoring_proposals_request_message_id"),
        table_name="ai_authoring_proposals",
    )
    op.drop_constraint(
        "fk_ai_authoring_proposals_request_message_id",
        "ai_authoring_proposals",
        type_="foreignkey",
    )
    op.drop_column("ai_authoring_proposals", "request_message_id")
