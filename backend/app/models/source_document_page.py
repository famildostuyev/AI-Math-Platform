from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.source_document import SourceDocument


class SourceDocumentPage(BaseModel):
    """Stable identity for one ordered page within a source document."""

    __tablename__ = "source_document_pages"

    __table_args__ = (
        CheckConstraint(
            "page_number > 0",
            name="ck_source_document_pages_number_positive",
        ),
        UniqueConstraint(
            "source_document_id",
            "page_number",
            name="uq_source_document_pages_document_number",
        ),
    )

    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )

    page_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    source_document: Mapped["SourceDocument"] = relationship(
        "SourceDocument",
        foreign_keys=[source_document_id],
    )
