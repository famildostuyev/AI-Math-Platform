from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictDocumentAnalysisModel(BaseModel):
    """Strict immutable base for provider-neutral document analysis DTOs."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class DocumentAnalysisPageVisual(StrictDocumentAnalysisModel):
    """Provider-neutral encoded visual content for one source page."""

    mime_type: str
    content: bytes

    @field_validator("mime_type")
    @classmethod
    def validate_mime_type(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or normalized != value or "/" not in normalized:
            raise ValueError("Page visual MIME type is invalid.")
        return normalized

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: bytes) -> bytes:
        if not value:
            raise ValueError("Page visual content cannot be empty.")
        return value


class DocumentAnalysisNeighborPage(StrictDocumentAnalysisModel):
    source_document_page_id: uuid.UUID
    page_number: int = Field(gt=0)
    raw_extracted_text: str | None

    @field_validator("raw_extracted_text")
    @classmethod
    def validate_raw_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Neighbor page raw text cannot be blank.")
        return value


class DocumentAnalysisPage(StrictDocumentAnalysisModel):
    source_document_page_id: uuid.UUID
    page_number: int = Field(gt=0)
    raw_extracted_text: str | None
    visual_content: DocumentAnalysisPageVisual | None
    neighbor_context: tuple[DocumentAnalysisNeighborPage, ...] = ()

    @field_validator("raw_extracted_text")
    @classmethod
    def validate_raw_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Page raw text cannot be blank.")
        return value


class DocumentAnalysisRequest(StrictDocumentAnalysisModel):
    source_document_id: uuid.UUID
    pages: tuple[DocumentAnalysisPage, ...]
    original_language: str | None
    processing_version: str
    prompt_version: str
    schema_version: int = Field(gt=0)

    @field_validator("pages")
    @classmethod
    def validate_pages(
        cls,
        value: tuple[DocumentAnalysisPage, ...],
    ) -> tuple[DocumentAnalysisPage, ...]:
        if not value:
            raise ValueError("Document analysis pages cannot be empty.")
        page_ids = [page.source_document_page_id for page in value]
        page_numbers = [page.page_number for page in value]
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("Document analysis page IDs must be unique.")
        if len(page_numbers) != len(set(page_numbers)):
            raise ValueError("Document analysis page numbers must be unique.")
        return value

    @field_validator(
        "original_language",
        "processing_version",
        "prompt_version",
    )
    @classmethod
    def validate_text_identifiers(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or value != value.strip()):
            raise ValueError("Document analysis identifier is invalid.")
        return value


class DocumentAnalysisPageReference(StrictDocumentAnalysisModel):
    source_document_page_id: uuid.UUID
    page_number: int = Field(gt=0)


class TextSegment(StrictDocumentAnalysisModel):
    type: Literal["text"] = "text"
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Text segment cannot be empty.")
        return value


class MathSegment(StrictDocumentAnalysisModel):
    type: Literal["math"] = "math"
    latex: str
    source_text: str
    display_mode: bool = False

    @field_validator("latex", "source_text")
    @classmethod
    def validate_math_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Math segment values cannot be empty.")
        return value


ContentSegment = Annotated[
    TextSegment | MathSegment,
    Field(discriminator="type"),
]


class StructuredContent(StrictDocumentAnalysisModel):
    format_version: Literal[1] = 1
    segments: tuple[ContentSegment, ...] = Field(min_length=1)


class DocumentAnalysisAnswerOption(StrictDocumentAnalysisModel):
    label: str | None = None
    text: str
    content: StructuredContent | None = None

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Answer option label cannot be blank.")
        return value

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Answer option text cannot be blank.")
        return value


class DocumentAnalysisCorrection(StrictDocumentAnalysisModel):
    original_value: str
    normalized_value: str
    reason: str

    @field_validator("original_value", "normalized_value", "reason")
    @classmethod
    def validate_nonblank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Correction values and reason cannot be blank.")
        return value


class QuestionAnalysis(StrictDocumentAnalysisModel):
    question_number: str | None = None
    question_text: str
    content: StructuredContent | None = None
    answer_options: tuple[DocumentAnalysisAnswerOption, ...] = ()
    source_pages: tuple[DocumentAnalysisPageReference, ...]
    visual_required: bool
    confidence: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    needs_review: bool
    corrections: tuple[DocumentAnalysisCorrection, ...] = ()

    @field_validator("question_number")
    @classmethod
    def validate_question_number(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Question number cannot be blank.")
        return value

    @field_validator("question_text")
    @classmethod
    def validate_question_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Question text cannot be blank.")
        return value

    @field_validator("source_pages")
    @classmethod
    def validate_source_pages(
        cls,
        value: tuple[DocumentAnalysisPageReference, ...],
    ) -> tuple[DocumentAnalysisPageReference, ...]:
        if not value:
            raise ValueError("Question source pages cannot be empty.")
        return value


class DocumentAnalysisProvenance(StrictDocumentAnalysisModel):
    provider_name: str
    model_name: str
    processor_version: str
    prompt_version: str
    schema_version: int = Field(gt=0)

    @field_validator(
        "provider_name",
        "model_name",
        "processor_version",
        "prompt_version",
    )
    @classmethod
    def validate_identifiers(cls, value: str) -> str:
        if not value.strip() or value != value.strip():
            raise ValueError("Document analysis provenance is invalid.")
        return value


class DocumentAnalysis(StrictDocumentAnalysisModel):
    schema_version: int = Field(gt=0)
    detected_language: str | None
    questions: tuple[QuestionAnalysis, ...]
    provenance: DocumentAnalysisProvenance

    @field_validator("detected_language")
    @classmethod
    def validate_detected_language(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or value != value.strip()):
            raise ValueError("Detected language is invalid.")
        return value


class DocumentAnalysisProviderError(Exception):
    """Base exception for provider-neutral document analysis failures."""

    safe_category = "unknown_provider_error"


class DocumentAnalysisProviderTimeoutError(DocumentAnalysisProviderError):
    """Raised when a document analysis provider times out."""

    safe_category = "timeout"


class DocumentAnalysisProviderRateLimitError(DocumentAnalysisProviderError):
    """Raised when a document analysis provider rejects request volume."""

    safe_category = "rate_limit"


class DocumentAnalysisProviderInvalidResponseError(
    DocumentAnalysisProviderError
):
    """Raised when a provider response violates the analysis contract."""

    safe_category = "invalid_response"


class DocumentAnalysisProviderAPIError(DocumentAnalysisProviderError):
    """Raised when a provider API request fails after SDK handling."""

    safe_category = "provider_api_error"


class DocumentAnalysisProviderNetworkError(DocumentAnalysisProviderError):
    """Raised when a provider network request cannot be completed."""

    safe_category = "provider_network_error"


@runtime_checkable
class DocumentAnalysisProvider(Protocol):
    """Provider-neutral interface for structured document understanding."""

    def analyze_document(
        self,
        request: DocumentAnalysisRequest,
    ) -> DocumentAnalysis:
        ...
