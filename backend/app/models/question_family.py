from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Enum as SQLEnum, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionFamilyOriginKind
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.user import User


class QuestionFamily(BaseModel):
    __tablename__ = "question_families"

    __table_args__ = (
        CheckConstraint(
            "source_family_id IS NULL OR source_family_id <> id",
            name="ck_question_families_source_not_self",
        ),
    )

    source_family_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_families.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    origin_kind: Mapped[QuestionFamilyOriginKind] = mapped_column(
        SQLEnum(
            QuestionFamilyOriginKind,
            name="question_family_origin_kind",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    source_family: Mapped["QuestionFamily | None"] = relationship(
        "QuestionFamily",
        remote_side="QuestionFamily.id",
        foreign_keys=[source_family_id],
        back_populates="derived_families",
    )

    derived_families: Mapped[list["QuestionFamily"]] = relationship(
        "QuestionFamily",
        foreign_keys="QuestionFamily.source_family_id",
        back_populates="source_family",
        passive_deletes=True,
    )

    created_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by_user_id],
    )
