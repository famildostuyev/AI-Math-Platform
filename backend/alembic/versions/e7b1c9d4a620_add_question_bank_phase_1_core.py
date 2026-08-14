"""add question bank phase 1 core

Revision ID: e7b1c9d4a620
Revises: c84f6a1d2e30
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e7b1c9d4a620"
down_revision: Union[str, Sequence[str], None] = "c84f6a1d2e30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the Question Bank Phase 1 core tables."""

    op.create_table(
        "question_types",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "sort_order",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_types_name",
        "question_types",
        ["name"],
        unique=True,
    )

    op.create_table(
        "question_families",
        sa.Column("source_family_id", sa.UUID(), nullable=True),
        sa.Column(
            "origin_kind",
            sa.Enum(
                "authored",
                "imported",
                "ai_generated_similar",
                name="question_family_origin_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
            "source_family_id IS NULL OR source_family_id <> id",
            name="ck_question_families_source_not_self",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["source_family_id"],
            ["question_families.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_families_created_by_user_id",
        "question_families",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_families_source_family_id",
        "question_families",
        ["source_family_id"],
        unique=False,
    )

    op.create_table(
        "question_forms",
        sa.Column("question_family_id", sa.UUID(), nullable=False),
        sa.Column("question_type_id", sa.UUID(), nullable=False),
        sa.Column("source_form_id", sa.UUID(), nullable=True),
        sa.Column(
            "derivation_kind",
            sa.Enum(
                "original",
                "transformed",
                name="question_form_derivation_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "open_response_mode",
            sa.Enum(
                "short_answer",
                "detailed_solution",
                name="open_response_mode",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column(
            "is_original",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
            "source_form_id IS NULL OR source_form_id <> id",
            name="ck_question_forms_source_not_self",
        ),
        sa.CheckConstraint(
            "(derivation_kind = 'original' AND source_form_id IS NULL) "
            "OR (derivation_kind = 'transformed' AND source_form_id IS NOT NULL)",
            name="ck_question_forms_derivation_source_consistent",
        ),
        sa.CheckConstraint(
            "is_original = (derivation_kind = 'original')",
            name="ck_question_forms_original_kind_consistent",
        ),
        sa.ForeignKeyConstraint(
            ["question_family_id"],
            ["question_families.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["question_type_id"],
            ["question_types.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_form_id"],
            ["question_forms.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_forms_question_family_id",
        "question_forms",
        ["question_family_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_forms_question_type_id",
        "question_forms",
        ["question_type_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_forms_source_form_id",
        "question_forms",
        ["source_form_id"],
        unique=False,
    )
    op.create_index(
        "uq_question_forms_one_original_per_family",
        "question_forms",
        ["question_family_id"],
        unique=True,
        postgresql_where=sa.text("is_original = true"),
    )

    op.create_table(
        "question_revisions",
        sa.Column("question_form_id", sa.UUID(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("based_on_revision_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "proposed",
                "approved",
                "rejected",
                name="question_revision_status",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "provenance_kind",
            sa.Enum(
                "human_authored",
                "imported",
                "ai_generated",
                "ai_transformed",
                "admin_edited",
                name="question_revision_provenance_kind",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column(
            "difficulty",
            sa.Enum(
                "easy",
                "medium",
                "hard",
                name="question_difficulty",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
        sa.Column("primary_topic_id", sa.UUID(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "is_current_approved",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
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
            "revision_number > 0",
            name="ck_question_revisions_number_positive",
        ),
        sa.CheckConstraint(
            "based_on_revision_id IS NULL OR based_on_revision_id <> id",
            name="ck_question_revisions_base_not_self",
        ),
        sa.CheckConstraint(
            "NOT is_current_approved OR status = 'approved'",
            name="ck_question_revisions_current_requires_approved",
        ),
        sa.CheckConstraint(
            "status <> 'approved' OR ("
            "primary_topic_id IS NOT NULL "
            "AND difficulty IS NOT NULL "
            "AND reviewed_by_user_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL)",
            name="ck_question_revisions_approved_complete",
        ),
        sa.ForeignKeyConstraint(
            ["based_on_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["primary_topic_id"],
            ["topics.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["question_form_id"],
            ["question_forms.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "question_form_id",
            "revision_number",
            name="uq_question_revisions_form_id_number",
        ),
    )
    op.create_index(
        "ix_question_revisions_based_on_revision_id",
        "question_revisions",
        ["based_on_revision_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revisions_created_by_user_id",
        "question_revisions",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revisions_primary_topic_id",
        "question_revisions",
        ["primary_topic_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revisions_question_form_id",
        "question_revisions",
        ["question_form_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revisions_reviewed_by_user_id",
        "question_revisions",
        ["reviewed_by_user_id"],
        unique=False,
    )
    op.create_index(
        "uq_question_revisions_one_current_approved_per_form",
        "question_revisions",
        ["question_form_id"],
        unique=True,
        postgresql_where=sa.text("is_current_approved = true"),
    )

    op.create_table(
        "question_revision_related_topics",
        sa.Column("question_revision_id", sa.UUID(), nullable=False),
        sa.Column("topic_id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["question_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["topic_id"],
            ["topics.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_revision_related_topics_question_revision_id",
        "question_revision_related_topics",
        ["question_revision_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revision_related_topics_topic_id",
        "question_revision_related_topics",
        ["topic_id"],
        unique=False,
    )
    op.create_index(
        "uq_question_revision_related_topics_active_link",
        "question_revision_related_topics",
        ["question_revision_id", "topic_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "question_revision_purposes",
        sa.Column("question_revision_id", sa.UUID(), nullable=False),
        sa.Column("purpose_id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["purpose_id"],
            ["purposes.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["question_revision_id"],
            ["question_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_question_revision_purposes_purpose_id",
        "question_revision_purposes",
        ["purpose_id"],
        unique=False,
    )
    op.create_index(
        "ix_question_revision_purposes_question_revision_id",
        "question_revision_purposes",
        ["question_revision_id"],
        unique=False,
    )
    op.create_index(
        "uq_question_revision_purposes_active_link",
        "question_revision_purposes",
        ["question_revision_id", "purpose_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Remove the Question Bank Phase 1 core tables."""

    op.drop_index(
        "uq_question_revision_purposes_active_link",
        table_name="question_revision_purposes",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        "ix_question_revision_purposes_question_revision_id",
        table_name="question_revision_purposes",
    )
    op.drop_index(
        "ix_question_revision_purposes_purpose_id",
        table_name="question_revision_purposes",
    )
    op.drop_table("question_revision_purposes")

    op.drop_index(
        "uq_question_revision_related_topics_active_link",
        table_name="question_revision_related_topics",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        "ix_question_revision_related_topics_topic_id",
        table_name="question_revision_related_topics",
    )
    op.drop_index(
        "ix_question_revision_related_topics_question_revision_id",
        table_name="question_revision_related_topics",
    )
    op.drop_table("question_revision_related_topics")

    op.drop_index(
        "uq_question_revisions_one_current_approved_per_form",
        table_name="question_revisions",
        postgresql_where=sa.text("is_current_approved = true"),
    )
    op.drop_index(
        "ix_question_revisions_reviewed_by_user_id",
        table_name="question_revisions",
    )
    op.drop_index(
        "ix_question_revisions_question_form_id",
        table_name="question_revisions",
    )
    op.drop_index(
        "ix_question_revisions_primary_topic_id",
        table_name="question_revisions",
    )
    op.drop_index(
        "ix_question_revisions_created_by_user_id",
        table_name="question_revisions",
    )
    op.drop_index(
        "ix_question_revisions_based_on_revision_id",
        table_name="question_revisions",
    )
    op.drop_table("question_revisions")

    op.drop_index(
        "uq_question_forms_one_original_per_family",
        table_name="question_forms",
        postgresql_where=sa.text("is_original = true"),
    )
    op.drop_index(
        "ix_question_forms_source_form_id",
        table_name="question_forms",
    )
    op.drop_index(
        "ix_question_forms_question_type_id",
        table_name="question_forms",
    )
    op.drop_index(
        "ix_question_forms_question_family_id",
        table_name="question_forms",
    )
    op.drop_table("question_forms")

    op.drop_index(
        "ix_question_families_source_family_id",
        table_name="question_families",
    )
    op.drop_index(
        "ix_question_families_created_by_user_id",
        table_name="question_families",
    )
    op.drop_table("question_families")

    op.drop_index("ix_question_types_name", table_name="question_types")
    op.drop_table("question_types")
