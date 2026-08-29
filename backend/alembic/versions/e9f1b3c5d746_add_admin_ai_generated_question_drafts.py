"""Add persistent non-canonical Admin AI question drafts.

Revision ID: e9f1b3c5d746
Revises: c7e9f1a3b524
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e9f1b3c5d746"
down_revision: Union[str, Sequence[str], None] = "c7e9f1a3b524"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_ai_generated_question_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("draft_kind", sa.String(length=32), nullable=False),
        sa.Column("format_hint", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("answer_options", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("correct_option_labels", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("explanation", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_canonical", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('active', 'promoted', 'discarded')", name="admin_ai_generated_question_draft_status"),
        sa.CheckConstraint("draft_kind IN ('question', 'explanation', 'solution', 'lesson_fragment', 'other')", name="ck_admin_ai_generated_drafts_kind"),
        sa.CheckConstraint("format_hint IN ('free_form', 'multiple_choice')", name="ck_admin_ai_generated_drafts_format_hint"),
        sa.CheckConstraint("is_canonical = false", name="ck_admin_ai_generated_drafts_noncanonical"),
        sa.CheckConstraint("jsonb_typeof(content) = 'object'", name="ck_admin_ai_generated_drafts_content_object"),
        sa.CheckConstraint("jsonb_typeof(answer_options) = 'array'", name="ck_admin_ai_generated_drafts_options_array"),
        sa.CheckConstraint("jsonb_typeof(correct_option_labels) = 'array'", name="ck_admin_ai_generated_drafts_correct_labels_array"),
        sa.CheckConstraint("explanation IS NULL OR jsonb_typeof(explanation) = 'object'", name="ck_admin_ai_generated_drafts_explanation_object_or_null"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_revision_id"], ["question_revisions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_ai_generated_question_drafts_owner_user_id", "admin_ai_generated_question_drafts", ["owner_user_id"])
    op.create_index("ix_admin_ai_generated_question_drafts_source_revision_id", "admin_ai_generated_question_drafts", ["source_revision_id"])
    op.create_index("ix_admin_ai_generated_question_drafts_status", "admin_ai_generated_question_drafts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_admin_ai_generated_question_drafts_status", table_name="admin_ai_generated_question_drafts")
    op.drop_index("ix_admin_ai_generated_question_drafts_source_revision_id", table_name="admin_ai_generated_question_drafts")
    op.drop_index("ix_admin_ai_generated_question_drafts_owner_user_id", table_name="admin_ai_generated_question_drafts")
    op.drop_table("admin_ai_generated_question_drafts")
