"""add AI authoring proposal foundation

Revision ID: b5d7f9a1c302
Revises: a1c3e5f7b920
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b5d7f9a1c302"
down_revision: Union[str, Sequence[str], None] = "a1c3e5f7b920"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_authoring_proposals",
        sa.Column("source_revision_id", sa.UUID(), nullable=False),
        sa.Column(
            "source_revision_updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("action_schema_version", sa.Integer(), nullable=False),
        sa.Column(
            "actions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("provider_name", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=200), nullable=False),
        sa.Column("prompt_version", sa.String(length=100), nullable=False),
        sa.Column("provider_schema_version", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.UUID(), nullable=True),
        sa.Column("accepted_by_user_id", sa.UUID(), nullable=True),
        sa.Column("rejected_by_user_id", sa.UUID(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('pending', 'accepted', 'rejected', 'obsolete')",
            name="ai_authoring_proposal_status",
        ),
        sa.CheckConstraint(
            "action_schema_version > 0",
            name="ck_ai_authoring_proposals_action_schema_version_positive",
        ),
        sa.CheckConstraint(
            "provider_schema_version > 0",
            name="ck_ai_authoring_proposals_provider_schema_version_positive",
        ),
        sa.CheckConstraint(
            "char_length(btrim(provider_name)) > 0 AND "
            "char_length(btrim(model_name)) > 0 AND "
            "char_length(btrim(prompt_version)) > 0",
            name="ck_ai_authoring_proposals_provenance_nonblank",
        ),
        sa.CheckConstraint(
            "(status = 'pending' AND accepted_by_user_id IS NULL AND "
            "rejected_by_user_id IS NULL AND accepted_at IS NULL AND "
            "rejected_at IS NULL) OR "
            "(status = 'accepted' AND accepted_by_user_id IS NOT NULL AND "
            "accepted_at IS NOT NULL AND rejected_by_user_id IS NULL AND "
            "rejected_at IS NULL) OR "
            "(status = 'rejected' AND rejected_by_user_id IS NOT NULL AND "
            "rejected_at IS NOT NULL AND accepted_by_user_id IS NULL AND "
            "accepted_at IS NULL) OR "
            "(status = 'obsolete' AND accepted_by_user_id IS NULL AND "
            "rejected_by_user_id IS NULL AND accepted_at IS NULL AND "
            "rejected_at IS NULL)",
            name="ck_ai_authoring_proposals_lifecycle_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["source_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["accepted_by_user_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["rejected_by_user_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ai_authoring_proposals_source_revision_id"),
        "ai_authoring_proposals",
        ["source_revision_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ai_authoring_proposals_requested_by_user_id"),
        "ai_authoring_proposals",
        ["requested_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_ai_authoring_proposals_requested_by_user_id"),
        table_name="ai_authoring_proposals",
    )
    op.drop_index(
        op.f("ix_ai_authoring_proposals_source_revision_id"),
        table_name="ai_authoring_proposals",
    )
    op.drop_table("ai_authoring_proposals")
