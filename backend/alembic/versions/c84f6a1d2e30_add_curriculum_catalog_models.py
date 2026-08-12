"""add curriculum catalog models

Revision ID: c84f6a1d2e30
Revises: bdfc885af5a5
Create Date: 2026-08-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c84f6a1d2e30"
down_revision: Union[str, Sequence[str], None] = "bdfc885af5a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the curriculum catalog hierarchy."""

    op.create_table(
        "subjects",
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
    op.create_index("ix_subjects_name", "subjects", ["name"], unique=True)

    op.create_table(
        "curriculum_programs",
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
        "ix_curriculum_programs_name",
        "curriculum_programs",
        ["name"],
        unique=True,
    )

    op.create_table(
        "curriculum_courses",
        sa.Column("curriculum_program_id", sa.UUID(), nullable=False),
        sa.Column("subject_id", sa.UUID(), nullable=False),
        sa.Column("grade_id", sa.UUID(), nullable=True),
        sa.Column("display_name", sa.String(length=150), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["curriculum_program_id"],
            ["curriculum_programs.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["grade_id"],
            ["grades.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["subject_id"],
            ["subjects.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_curriculum_courses_curriculum_program_id",
        "curriculum_courses",
        ["curriculum_program_id"],
        unique=False,
    )
    op.create_index(
        "ix_curriculum_courses_grade_id",
        "curriculum_courses",
        ["grade_id"],
        unique=False,
    )
    op.create_index(
        "ix_curriculum_courses_subject_id",
        "curriculum_courses",
        ["subject_id"],
        unique=False,
    )
    op.create_index(
        "uq_curriculum_courses_program_subject_grade",
        "curriculum_courses",
        ["curriculum_program_id", "subject_id", "grade_id"],
        unique=True,
        postgresql_where=sa.text("grade_id IS NOT NULL"),
    )
    op.create_index(
        "uq_curriculum_courses_program_subject_no_grade",
        "curriculum_courses",
        ["curriculum_program_id", "subject_id"],
        unique=True,
        postgresql_where=sa.text("grade_id IS NULL"),
    )

    op.create_table(
        "sections",
        sa.Column("curriculum_course_id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["curriculum_course_id"],
            ["curriculum_courses.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "curriculum_course_id",
            "name",
            name="uq_sections_curriculum_course_id_name",
        ),
    )
    op.create_index(
        "ix_sections_curriculum_course_id",
        "sections",
        ["curriculum_course_id"],
        unique=False,
    )

    op.create_table(
        "topics",
        sa.Column("section_id", sa.UUID(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["section_id"],
            ["sections.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["section_id", "parent_id"],
            ["topics.section_id", "topics.id"],
            name="fk_topics_section_id_parent_id_topics",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "section_id",
            "id",
            name="uq_topics_section_id_id",
        ),
        sa.UniqueConstraint(
            "section_id",
            "name",
            name="uq_topics_section_id_name",
        ),
    )
    op.create_index(
        "ix_topics_parent_id",
        "topics",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_topics_section_id",
        "topics",
        ["section_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the curriculum catalog hierarchy."""

    op.drop_index("ix_topics_section_id", table_name="topics")
    op.drop_index("ix_topics_parent_id", table_name="topics")
    op.drop_table("topics")

    op.drop_index("ix_sections_curriculum_course_id", table_name="sections")
    op.drop_table("sections")

    op.drop_index(
        "uq_curriculum_courses_program_subject_no_grade",
        table_name="curriculum_courses",
        postgresql_where=sa.text("grade_id IS NULL"),
    )
    op.drop_index(
        "uq_curriculum_courses_program_subject_grade",
        table_name="curriculum_courses",
        postgresql_where=sa.text("grade_id IS NOT NULL"),
    )
    op.drop_index(
        "ix_curriculum_courses_subject_id",
        table_name="curriculum_courses",
    )
    op.drop_index(
        "ix_curriculum_courses_grade_id",
        table_name="curriculum_courses",
    )
    op.drop_index(
        "ix_curriculum_courses_curriculum_program_id",
        table_name="curriculum_courses",
    )
    op.drop_table("curriculum_courses")

    op.drop_index(
        "ix_curriculum_programs_name",
        table_name="curriculum_programs",
    )
    op.drop_table("curriculum_programs")

    op.drop_index("ix_subjects_name", table_name="subjects")
    op.drop_table("subjects")
