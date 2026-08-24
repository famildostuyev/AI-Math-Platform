from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.document_analysis_provider import DocumentAnalysisPageVisual


class StrictRawDocumentModel(BaseModel):
    """Strict immutable base for provider-neutral raw document material."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class RawDocumentPage(StrictRawDocumentModel):
    source_document_page_id: uuid.UUID
    page_number: int = Field(gt=0)
    raw_text: str
    visual_content: DocumentAnalysisPageVisual | None = None
    extraction_method: str
    extraction_version: str

    @field_validator("extraction_method", "extraction_version")
    @classmethod
    def validate_extraction_identity(cls, value: str) -> str:
        if not value or value != value.strip():
            raise ValueError("Raw page extraction identity is invalid.")
        return value


class RawDocument(StrictRawDocumentModel):
    source_document_id: uuid.UUID
    pages: tuple[RawDocumentPage, ...]

    @field_validator("pages")
    @classmethod
    def validate_pages(
        cls,
        value: tuple[RawDocumentPage, ...],
    ) -> tuple[RawDocumentPage, ...]:
        if not value:
            raise ValueError("Raw document pages cannot be empty.")
        expected_numbers = tuple(range(1, len(value) + 1))
        page_numbers = tuple(page.page_number for page in value)
        if page_numbers != expected_numbers:
            raise ValueError("Raw document pages must be ordered from one.")
        page_ids = tuple(page.source_document_page_id for page in value)
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("Raw document page IDs must be unique.")
        return value
