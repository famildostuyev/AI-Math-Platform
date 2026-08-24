from __future__ import annotations

import base64
import logging
import uuid
from decimal import Decimal
from typing import Protocol

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.config import settings
from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisAnswerOption,
    DocumentAnalysisCorrection,
    DocumentAnalysisNeighborPage,
    DocumentAnalysisPage,
    DocumentAnalysisPageReference,
    DocumentAnalysisProvenance,
    DocumentAnalysisProviderError,
    DocumentAnalysisProviderAPIError,
    DocumentAnalysisProviderInvalidResponseError,
    DocumentAnalysisProviderNetworkError,
    DocumentAnalysisProviderRateLimitError,
    DocumentAnalysisProviderTimeoutError,
    DocumentAnalysisRequest,
    QuestionAnalysis,
)
from app.services.raw_document import RawDocument


OPENAI_PROVIDER_NAME = "openai"
logger = logging.getLogger(__name__)
DOCUMENT_ANALYSIS_INSTRUCTIONS = """
Analyze only the supplied source material and extract every separate question
in source order. Do not omit questions, combine separate questions, or split a
single question without evidence. Preserve the original language,
mathematical meaning, question numbering, answer options, formulas,
coordinates, signs, symbols, fractions, and exact source-page references.
Do not translate, shorten, approve, or invent content.

Detect Variant C and Variant D separately when they occur. Preserve each
variant's source numbering in every question object and, when supported by the
source, use a deterministic question_number such as "Variant C / 1" or
"Variant D / 1".

Compare the extracted text layer with every supplied page visual. Correct a
real OCR or text-extraction mismatch only when visual evidence supports the
correction, and give a concrete correction reason. Never create a correction
from speculation.

Set visual_required=true only when solving or fully understanding the question
depends on visual material; the mere presence of a page image is not enough.
Set needs_review=true when confidence is low or question boundaries,
numbering, visual interpretation, or corrected content remain uncertain. Do
not mark clear questions for review unnecessarily.
""".strip()


class _OpenAIStructuredModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _OpenAIPageReference(_OpenAIStructuredModel):
    source_document_page_id: str
    page_number: int = Field(gt=0)


class _OpenAIAnswerOption(_OpenAIStructuredModel):
    label: str | None = None
    text: str


class _OpenAICorrection(_OpenAIStructuredModel):
    original_value: str
    normalized_value: str
    reason: str


class _OpenAIQuestion(_OpenAIStructuredModel):
    question_number: str | None = None
    question_text: str
    answer_options: list[_OpenAIAnswerOption]
    source_pages: list[_OpenAIPageReference]
    visual_required: bool
    confidence: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    needs_review: bool
    corrections: list[_OpenAICorrection]


class _OpenAIDocumentAnalysis(_OpenAIStructuredModel):
    detected_language: str | None
    questions: list[_OpenAIQuestion]


class _ResponsesResource(Protocol):
    def parse(self, **kwargs: object) -> object:
        ...


class _OpenAIClient(Protocol):
    responses: _ResponsesResource


def build_document_analysis_request(
    raw_document: RawDocument,
    *,
    original_language: str | None = None,
    processing_version: str = (
        settings.OPENAI_DOCUMENT_ANALYSIS_PROCESSING_VERSION
    ),
    prompt_version: str = settings.OPENAI_DOCUMENT_ANALYSIS_PROMPT_VERSION,
    schema_version: int = settings.OPENAI_DOCUMENT_ANALYSIS_SCHEMA_VERSION,
) -> DocumentAnalysisRequest:
    """Map raw page material into the provider-neutral analysis request."""

    pages: list[DocumentAnalysisPage] = []
    for index, raw_page in enumerate(raw_document.pages):
        neighbors: list[DocumentAnalysisNeighborPage] = []
        for neighbor_index in (index - 1, index + 1):
            if 0 <= neighbor_index < len(raw_document.pages):
                neighbor = raw_document.pages[neighbor_index]
                neighbors.append(
                    DocumentAnalysisNeighborPage(
                        source_document_page_id=(
                            neighbor.source_document_page_id
                        ),
                        page_number=neighbor.page_number,
                        raw_extracted_text=neighbor.raw_text or None,
                    )
                )
        pages.append(
            DocumentAnalysisPage(
                source_document_page_id=raw_page.source_document_page_id,
                page_number=raw_page.page_number,
                raw_extracted_text=raw_page.raw_text or None,
                visual_content=raw_page.visual_content,
                neighbor_context=tuple(neighbors),
            )
        )

    return DocumentAnalysisRequest(
        source_document_id=raw_document.source_document_id,
        pages=tuple(pages),
        original_language=original_language,
        processing_version=processing_version,
        prompt_version=prompt_version,
        schema_version=schema_version,
    )


class OpenAIDocumentAnalysisProvider:
    """OpenAI adapter for provider-neutral structured document analysis."""

    def __init__(
        self,
        *,
        client: _OpenAIClient | None = None,
        api_key: str | None = settings.OPENAI_API_KEY,
        model: str = settings.OPENAI_DOCUMENT_ANALYSIS_MODEL,
        timeout_seconds: float = (
            settings.OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS
        ),
        prompt_version: str = (
            settings.OPENAI_DOCUMENT_ANALYSIS_PROMPT_VERSION
        ),
        processing_version: str = (
            settings.OPENAI_DOCUMENT_ANALYSIS_PROCESSING_VERSION
        ),
        schema_version: int = (
            settings.OPENAI_DOCUMENT_ANALYSIS_SCHEMA_VERSION
        ),
        instructions: str = DOCUMENT_ANALYSIS_INSTRUCTIONS,
    ) -> None:
        if not model.strip():
            raise DocumentAnalysisProviderError(
                "OpenAI document analysis model is unavailable."
            )
        if timeout_seconds <= 0:
            raise DocumentAnalysisProviderError(
                "OpenAI document analysis timeout is invalid."
            )
        if not instructions.strip():
            raise DocumentAnalysisProviderError(
                "OpenAI document analysis instructions are unavailable."
            )
        managed_client = client is None
        if client is None:
            if api_key is None or not api_key.strip():
                raise DocumentAnalysisProviderError(
                    "OpenAI document analysis credentials are unavailable."
                )
            client = OpenAI(
                api_key=api_key,
                timeout=timeout_seconds,
                max_retries=0,
            )
        self._client = client
        self._retry_count = 0 if managed_client else None
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._prompt_version = prompt_version
        self._processing_version = processing_version
        self._schema_version = schema_version
        self._instructions = instructions

    def analyze_document(
        self,
        request: DocumentAnalysisRequest,
    ) -> DocumentAnalysis:
        if not isinstance(request, DocumentAnalysisRequest):
            raise DocumentAnalysisProviderError(
                "Document analysis request is invalid."
            )
        if (
            request.prompt_version != self._prompt_version
            or request.processing_version != self._processing_version
            or request.schema_version != self._schema_version
        ):
            raise DocumentAnalysisProviderError(
                "Document analysis request version is incompatible."
            )

        try:
            response = self._client.responses.parse(
                model=self._model,
                instructions=self._instructions,
                input=self._map_request(request),
                text_format=_OpenAIDocumentAnalysis,
                timeout=self._timeout_seconds,
                store=False,
            )
        except APITimeoutError as exc:
            self._log_failure(category="timeout")
            raise DocumentAnalysisProviderTimeoutError(
                "Document analysis provider timed out."
            ) from exc
        except RateLimitError as exc:
            self._log_failure(category="rate_limit")
            raise DocumentAnalysisProviderRateLimitError(
                "Document analysis provider rate limit was exceeded."
            ) from exc
        except APIConnectionError as exc:
            self._log_failure(category="provider_network_error")
            raise DocumentAnalysisProviderNetworkError(
                "Document analysis provider network request failed."
            ) from exc
        except APIError as exc:
            self._log_failure(category="provider_api_error")
            raise DocumentAnalysisProviderAPIError(
                "Document analysis provider request failed."
            ) from exc
        except Exception as exc:
            self._log_failure(
                category="unknown_provider_error",
                exception=exc,
            )
            raise DocumentAnalysisProviderError(
                "Document analysis provider request failed."
            ) from exc

        try:
            parsed = getattr(response, "output_parsed", None)
            if not isinstance(parsed, _OpenAIDocumentAnalysis):
                raise ValueError("Structured output is unavailable.")
            return self._map_response(request=request, parsed=parsed)
        except (ValidationError, ValueError, TypeError) as exc:
            self._log_failure(category="invalid_response")
            raise DocumentAnalysisProviderInvalidResponseError(
                "Document analysis provider response is invalid."
            ) from exc

    def _log_failure(
        self,
        *,
        category: str,
        exception: Exception | None = None,
    ) -> None:
        if exception is not None:
            status_code = getattr(exception, "status_code", None)
            safe_status_code = (
                status_code if type(status_code) is int else "unknown"
            )
            safe_retry_count = (
                self._retry_count
                if type(self._retry_count) is int
                else "unknown"
            )
            logger.warning(
                "document_analysis_provider_failure "
                "provider=%s category=%s model=%s exception_type=%s "
                "status_code=%s retry_count=%s",
                OPENAI_PROVIDER_NAME,
                category,
                self._model,
                type(exception).__name__,
                safe_status_code,
                safe_retry_count,
            )
            return
        logger.warning(
            "document_analysis_provider_failure "
            "provider=%s category=%s model=%s",
            OPENAI_PROVIDER_NAME,
            category,
            self._model,
        )

    @staticmethod
    def _map_request(request: DocumentAnalysisRequest) -> list[dict[str, object]]:
        content: list[dict[str, object]] = []
        for page in request.pages:
            neighbor_text = "\n".join(
                f"Neighbor page {neighbor.page_number}: "
                f"{neighbor.raw_extracted_text or '[no text layer]'}"
                for neighbor in page.neighbor_context
            )
            content.append(
                {
                    "type": "input_text",
                    "text": (
                        f"Source document: {request.source_document_id}\n"
                        f"Source page ID: {page.source_document_page_id}\n"
                        f"Page number: {page.page_number}\n"
                        f"Original language: "
                        f"{request.original_language or '[unknown]'}\n"
                        f"Raw text:\n{page.raw_extracted_text or '[no text layer]'}"
                        + (f"\n{neighbor_text}" if neighbor_text else "")
                    ),
                }
            )
            if page.visual_content is not None:
                encoded = base64.b64encode(
                    page.visual_content.content
                ).decode("ascii")
                content.append(
                    {
                        "type": "input_image",
                        "image_url": (
                            f"data:{page.visual_content.mime_type};base64,{encoded}"
                        ),
                        "detail": "high",
                    }
                )
        return [{"role": "user", "content": content}]

    def _map_response(
        self,
        *,
        request: DocumentAnalysisRequest,
        parsed: _OpenAIDocumentAnalysis,
    ) -> DocumentAnalysis:
        allowed_pages = {
            (str(page.source_document_page_id), page.page_number)
            for page in request.pages
        }
        questions: list[QuestionAnalysis] = []
        for question in parsed.questions:
            references = tuple(
                DocumentAnalysisPageReference(
                    source_document_page_id=uuid.UUID(
                        reference.source_document_page_id
                    ),
                    page_number=reference.page_number,
                )
                for reference in question.source_pages
            )
            if any(
                (str(reference.source_document_page_id), reference.page_number)
                not in allowed_pages
                for reference in references
            ):
                raise ValueError("Provider referenced an unavailable source page.")
            questions.append(
                QuestionAnalysis(
                    question_number=question.question_number,
                    question_text=question.question_text,
                    answer_options=tuple(
                        DocumentAnalysisAnswerOption(
                            label=option.label, text=option.text,
                        )
                        for option in question.answer_options
                    ),
                    source_pages=references,
                    visual_required=question.visual_required,
                    confidence=question.confidence,
                    needs_review=question.needs_review,
                    corrections=tuple(
                        DocumentAnalysisCorrection(
                            original_value=correction.original_value,
                            normalized_value=correction.normalized_value,
                            reason=correction.reason,
                        )
                        for correction in question.corrections
                    ),
                )
            )
        return DocumentAnalysis(
            schema_version=request.schema_version,
            detected_language=parsed.detected_language,
            questions=tuple(questions),
            provenance=DocumentAnalysisProvenance(
                provider_name=OPENAI_PROVIDER_NAME,
                model_name=self._model,
                processor_version=request.processing_version,
                prompt_version=request.prompt_version,
                schema_version=request.schema_version,
            ),
        )
