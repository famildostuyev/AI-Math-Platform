"""add AI authoring conversations and messages

Revision ID: c7e9a1b3d504
Revises: b5d7f9a1c302
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e9a1b3d504"
down_revision: Union[str, Sequence[str], None] = "b5d7f9a1c302"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _base_columns() -> tuple[sa.Column, ...]:
    return (
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
    )


def upgrade() -> None:
    op.create_table(
        "ai_authoring_conversations",
        sa.Column("active_revision_id", sa.UUID(), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=6), nullable=False),
        *_base_columns(),
        sa.CheckConstraint(
            "status IN ('active', 'closed')",
            name="ai_authoring_conversation_status",
        ),
        sa.ForeignKeyConstraint(
            ["active_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ai_authoring_conversations_active_revision_id"),
        "ai_authoring_conversations",
        ["active_revision_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_authoring_conversations_created_by_user_id"),
        "ai_authoring_conversations",
        ["created_by_user_id"],
        unique=False,
    )

    op.create_table(
        "ai_authoring_messages",
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=9), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.String(length=10000), nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        *_base_columns(),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system')",
            name="ai_authoring_message_role",
        ),
        sa.CheckConstraint(
            "sequence_number > 0",
            name="ck_ai_authoring_messages_sequence_positive",
        ),
        sa.CheckConstraint(
            "char_length(btrim(content)) > 0",
            name="ck_ai_authoring_messages_content_nonblank",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_authoring_conversations.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "sequence_number",
            name="uq_ai_authoring_messages_conversation_sequence",
        ),
    )
    op.create_index(
        op.f("ix_ai_authoring_messages_conversation_id"),
        "ai_authoring_messages",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_authoring_messages_created_by_user_id"),
        "ai_authoring_messages",
        ["created_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_authoring_messages_created_by_user_id"),
        table_name="ai_authoring_messages",
    )
    op.drop_index(
        op.f("ix_ai_authoring_messages_conversation_id"),
        table_name="ai_authoring_messages",
    )
    op.drop_table("ai_authoring_messages")
    op.drop_index(
        op.f("ix_ai_authoring_conversations_created_by_user_id"),
        table_name="ai_authoring_conversations",
    )
    op.drop_index(
        op.f("ix_ai_authoring_conversations_active_revision_id"),
        table_name="ai_authoring_conversations",
    )
    op.drop_table("ai_authoring_conversations")
