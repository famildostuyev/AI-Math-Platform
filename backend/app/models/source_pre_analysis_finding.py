from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.source_document_page import SourceDocumentPage
    from app.models.source_pre_analysis_result import SourcePreAnalysisResult


class SourcePreAnalysisFinding(BaseModel):
    """Immutable processor observation for one pre-analysis result."""

    __tablename__ = "source_pre_analysis_findings"

    __table_args__ = (
        CheckConstraint(
            "sequence_number > 0",
            name="ck_source_pre_analysis_findings_sequence_positive",
        ),
        CheckConstraint(
            "char_length(btrim(finding_code)) > 0",
            name="ck_source_pre_analysis_findings_code_nonblank",
        ),
        CheckConstraint(
            "char_length(btrim(message)) > 0",
            name="ck_source_pre_analysis_findings_message_nonblank",
        ),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_source_pre_analysis_findings_confidence_range",
        ),
        UniqueConstraint(
            "source_pre_analysis_result_id",
            "sequence_number",
            name="uq_source_pre_analysis_findings_result_sequence",
        ),
        Index(
            "ix_source_pre_analysis_findings_source_document_page_id",
            "source_document_page_id",
        ),
    )

    source_pre_analysis_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_pre_analysis_results.id", ondelete="RESTRICT"),
        nullable=False,
    )

    source_document_page_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_document_pages.id", ondelete="RESTRICT"),
        nullable=True,
    )

    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)

    finding_code: Mapped[str] = mapped_column(String(100), nullable=False)

    severity: Mapped[SourcePreAnalysisFindingSeverity] = mapped_column(
        SQLEnum(
            SourcePreAnalysisFindingSeverity,
            name="source_pre_analysis_finding_severity",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    confidence: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 4),
        nullable=True,
    )

    message: Mapped[str] = mapped_column(Text, nullable=False)

    source_pre_analysis_result: Mapped["SourcePreAnalysisResult"] = relationship(
        "SourcePreAnalysisResult",
        foreign_keys=[source_pre_analysis_result_id],
    )

    source_document_page: Mapped["SourceDocumentPage | None"] = relationship(
        "SourceDocumentPage",
        foreign_keys=[source_document_page_id],
    )
