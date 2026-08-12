from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.curriculum_program import CurriculumProgram
    from app.models.grade import Grade
    from app.models.section import Section
    from app.models.subject import Subject


class CurriculumCourse(BaseModel):
    __tablename__ = "curriculum_courses"

    __table_args__ = (
        Index(
            "uq_curriculum_courses_program_subject_grade",
            "curriculum_program_id",
            "subject_id",
            "grade_id",
            unique=True,
            postgresql_where=text("grade_id IS NOT NULL"),
        ),
        Index(
            "uq_curriculum_courses_program_subject_no_grade",
            "curriculum_program_id",
            "subject_id",
            unique=True,
            postgresql_where=text("grade_id IS NULL"),
        ),
    )

    curriculum_program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("curriculum_programs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    grade_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("grades.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    display_name: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    program: Mapped["CurriculumProgram"] = relationship(
        "CurriculumProgram",
        back_populates="courses",
    )

    subject: Mapped["Subject"] = relationship(
        "Subject",
        back_populates="courses",
    )

    grade: Mapped["Grade | None"] = relationship(
        "Grade",
        back_populates="curriculum_courses",
    )

    sections: Mapped[list["Section"]] = relationship(
        "Section",
        back_populates="course",
    )
