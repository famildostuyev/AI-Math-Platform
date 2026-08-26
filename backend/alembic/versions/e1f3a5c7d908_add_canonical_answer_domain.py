"""add canonical answer domain

Revision ID: e1f3a5c7d908
Revises: d9f1b3c5e706
Create Date: 2026-08-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e1f3a5c7d908"
down_revision: Union[str, Sequence[str], None] = "d9f1b3c5e706"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _content_columns() -> tuple[sa.Column, ...]:
    return (
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("document_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("format_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )


def _base_columns() -> tuple[sa.Column, ...]:
    return (
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def upgrade() -> None:
    op.create_table(
        "answer_options",
        sa.Column("revision_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        *_content_columns(),
        sa.Column("is_correct", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        *_base_columns(),
        sa.CheckConstraint("order_index > 0", name="ck_answer_options_order_positive"),
        sa.CheckConstraint("label IS NULL OR char_length(btrim(label)) > 0", name="ck_answer_options_label_nonblank"),
        sa.CheckConstraint("format_version > 0", name="ck_answer_options_format_version_positive"),
        sa.CheckConstraint("jsonb_typeof(document_data) = 'object'", name="ck_answer_options_document_data_object"),
        sa.ForeignKeyConstraint(["revision_id"], ["question_revisions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_answer_options_revision_id"), "answer_options", ["revision_id"])
    op.create_index("uq_answer_options_active_revision_order", "answer_options", ["revision_id", "order_index"], unique=True, postgresql_where=sa.text("deleted_at IS NULL"))
    op.create_index("uq_answer_options_active_revision_label", "answer_options", ["revision_id", "label"], unique=True, postgresql_where=sa.text("deleted_at IS NULL AND label IS NOT NULL"))

    op.create_table(
        "accepted_answers",
        sa.Column("revision_id", sa.UUID(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        *_content_columns(),
        *_base_columns(),
        sa.CheckConstraint("order_index > 0", name="ck_accepted_answers_order_positive"),
        sa.CheckConstraint("format_version > 0", name="ck_accepted_answers_format_version_positive"),
        sa.CheckConstraint("jsonb_typeof(document_data) = 'object'", name="ck_accepted_answers_document_data_object"),
        sa.ForeignKeyConstraint(["revision_id"], ["question_revisions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_accepted_answers_revision_id"), "accepted_answers", ["revision_id"])
    op.create_index("uq_accepted_answers_active_revision_order", "accepted_answers", ["revision_id", "order_index"], unique=True, postgresql_where=sa.text("deleted_at IS NULL"))


def downgrade() -> None:
    op.drop_index("uq_accepted_answers_active_revision_order", table_name="accepted_answers")
    op.drop_index(op.f("ix_accepted_answers_revision_id"), table_name="accepted_answers")
    op.drop_table("accepted_answers")
    op.drop_index("uq_answer_options_active_revision_label", table_name="answer_options")
    op.drop_index("uq_answer_options_active_revision_order", table_name="answer_options")
    op.drop_index(op.f("ix_answer_options_revision_id"), table_name="answer_options")
    op.drop_table("answer_options")
