from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import OpenResponseMode, QuestionFormDerivationKind
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.question_source import QuestionSource


class QuestionForm(BaseModel):
    __tablename__ = "question_forms"

    __table_args__ = (
        CheckConstraint(
            "source_form_id IS NULL OR source_form_id <> id",
            name="ck_question_forms_source_not_self",
        ),
        CheckConstraint(
            "(derivation_kind = 'original' AND source_form_id IS NULL) "
            "OR (derivation_kind = 'transformed' AND source_form_id IS NOT NULL)",
            name="ck_question_forms_derivation_source_consistent",
        ),
        CheckConstraint(
            "is_original = (derivation_kind = 'original')",
            name="ck_question_forms_original_kind_consistent",
        ),
        Index(
            "uq_question_forms_one_original_per_family",
            "question_family_id",
            unique=True,
            postgresql_where=text("is_original = true"),
        ),
    )

    question_family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_families.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    question_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    source_form_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_forms.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_sources.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    source_detail: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    derivation_kind: Mapped[QuestionFormDerivationKind] = mapped_column(
        SQLEnum(
            QuestionFormDerivationKind,
            name="question_form_derivation_kind",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    open_response_mode: Mapped[OpenResponseMode | None] = mapped_column(
        SQLEnum(
            OpenResponseMode,
            name="open_response_mode",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=True,
    )

    is_original: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    question_family: Mapped["QuestionFamily"] = relationship(
        "QuestionFamily",
        foreign_keys=[question_family_id],
    )

    question_type: Mapped["QuestionType"] = relationship(
        "QuestionType",
        foreign_keys=[question_type_id],
    )

    source: Mapped["QuestionSource | None"] = relationship(
        "QuestionSource",
        foreign_keys=[source_id],
        back_populates="question_forms",
    )

    source_form: Mapped["QuestionForm | None"] = relationship(
        "QuestionForm",
        remote_side="QuestionForm.id",
        foreign_keys=[source_form_id],
        back_populates="derived_forms",
    )

    derived_forms: Mapped[list["QuestionForm"]] = relationship(
        "QuestionForm",
        foreign_keys="QuestionForm.source_form_id",
        back_populates="source_form",
        passive_deletes=True,
    )
