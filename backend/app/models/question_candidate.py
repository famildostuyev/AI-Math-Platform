from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.source_document import SourceDocument
    from app.models.source_document_page import SourceDocumentPage


class QuestionCandidate(BaseModel):
    """Extracted question-like content awaiting downstream review and promotion."""

    __tablename__ = "question_candidates"

    __table_args__ = (
        CheckConstraint(
            "sequence_number > 0",
            name="ck_question_candidates_sequence_positive",
        ),
        CheckConstraint(
            "char_length(btrim(extracted_text)) > 0",
            name="ck_question_candidates_text_nonblank",
        ),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_question_candidates_confidence_range",
        ),
        UniqueConstraint(
            "source_document_id",
            "sequence_number",
            name="uq_question_candidates_document_sequence",
        ),
    )

    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )

    source_document_page_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_document_pages.id", ondelete="RESTRICT"),
        nullable=True,
    )

    sequence_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    extracted_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 4),
        nullable=True,
    )

    source_document: Mapped["SourceDocument"] = relationship(
        "SourceDocument",
        foreign_keys=[source_document_id],
    )

    source_document_page: Mapped["SourceDocumentPage | None"] = relationship(
        "SourceDocumentPage",
        foreign_keys=[source_document_page_id],
    )