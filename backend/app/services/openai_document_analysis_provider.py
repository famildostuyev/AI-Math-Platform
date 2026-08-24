from __future__ import annotations

import base64
import logging
import re
import uuid
from decimal import Decimal
from typing import Literal, Protocol

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
    MathSegment,
    QuestionAnalysis,
    StructuredContent,
    TextSegment,
)
from app.services.raw_document import RawDocument


OPENAI_PROVIDER_NAME = "openai"
VALIDATION_LOG_MAX_ERRORS = 5
VALIDATION_LOG_MAX_PATH_LENGTH = 160
VALIDATION_LOG_MAX_COMPONENT_LENGTH = 64
_SAFE_VALIDATION_COMPONENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SAFE_VALIDATION_TYPE = re.compile(r"^[a-z][a-z0-9_]*$")
logger = logging.getLogger(__name__)
DOCUMENT_ANALYSIS_INSTRUCTIONS = """
Analyze only the supplied source material and extract every separate question
in source order. Do not omit questions, combine separate questions, or split a
single question without evidence. Preserve the original language,
mathematical meaning, question numbering, answer options, formulas,
coordinates, signs, symbols, fractions, and exact source-page references.
Do not translate, shorten, approve, or invent content.

Use answer_options only for selectable multiple-choice answers. Preserve every
source option label. When a four-option multiple-choice question has no visible
labels, assign A, B, C, and D in source order. Keep matching structures in the
question text; do not convert their rows or columns into answer_options.

Return optional versioned content segments only for question text that actually
contains mathematical notation. For an ordinary prose-only question, return
content=null instead of a redundant single text segment. For a math-bearing
question, split prose and math into ordered text/math segments. Treat fractions,
roots, powers, subscripts, Greek letters, angles, equations, and other
mathematical notation as math-bearing. Every math segment must contain valid
LaTeX and source_text preserving the visible or faithfully reconstructed
original math text. Never convert the entire mixed question into one LaTeX
string. Return answer options as label and plain text only, preserving their
source order; do not segment answer option text. Always keep question_text and
answer option text populated as plain-text fallbacks, including when question
content is null.

Detect Variant C and Variant D separately when they occur. Preserve each
variant's source numbering in every question object and, when supported by the
source, use a deterministic question_number such as "Variant C / 1" or
"Variant D / 1".

Compare the extracted text layer with every supplied page visual. Correct a
real OCR or text-extraction mismatch only when visual evidence supports the
correction, and give a concrete correction reason. Never create a correction
from speculation. Every question object must include the corrections field.
Return corrections=[] when there is no correction; otherwise return structured
correction objects. Never omit corrections and never return corrections=null.

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


class _OpenAITextSegment(_OpenAIStructuredModel):
    type: Literal["text"]
    text: str


class _OpenAIMathSegment(_OpenAIStructuredModel):
    type: Literal["math"]
    latex: str
    source_text: str
    display_mode: bool


_OpenAIContentSegment = _OpenAITextSegment | _OpenAIMathSegment


class _OpenAIStructuredContent(_OpenAIStructuredModel):
    format_version: Literal[1]
    segments: list[_OpenAIContentSegment] = Field(min_length=1)


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
    content: _OpenAIStructuredContent | None = None
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


def _map_structured_content(
    content: _OpenAIStructuredContent | None,
) -> StructuredContent | None:
    if content is None:
        return None
    segments = tuple(
        TextSegment(text=segment.text)
        if isinstance(segment, _OpenAITextSegment)
        else MathSegment(
            latex=segment.latex,
            source_text=segment.source_text,
            display_mode=segment.display_mode,
        )
        for segment in content.segments
    )
    return StructuredContent(
        format_version=content.format_version,
        segments=segments,
    )


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
            self._log_failure(
                category="provider_api_error",
                exception=exc,
            )
            raise DocumentAnalysisProviderAPIError(
                "Document analysis provider request failed."
            ) from exc
        except ValidationError as exc:
            self._log_validation_failure(exception=exc)
            raise DocumentAnalysisProviderInvalidResponseError(
                "Document analysis provider response is invalid."
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
        except ValidationError as exc:
            self._log_validation_failure(exception=exc)
            raise DocumentAnalysisProviderInvalidResponseError(
                "Document analysis provider response is invalid."
            ) from exc
        except (ValueError, TypeError) as exc:
            self._log_failure(category="invalid_response")
            raise DocumentAnalysisProviderInvalidResponseError(
                "Document analysis provider response is invalid."
            ) from exc

    def _log_validation_failure(
        self,
        *,
        exception: ValidationError,
    ) -> None:
        errors = exception.errors(
            include_input=False,
            include_url=False,
            include_context=False,
        )
        paths: list[str] = []
        error_types: list[str] = []
        for error in errors[:VALIDATION_LOG_MAX_ERRORS]:
            components: list[str] = []
            for component in error.get("loc", ()):
                if type(component) is int:
                    components.append(str(component))
                elif (
                    type(component) is str
                    and len(component) <= VALIDATION_LOG_MAX_COMPONENT_LENGTH
                    and _SAFE_VALIDATION_COMPONENT.fullmatch(component)
                ):
                    components.append(component)
                else:
                    components.append("field")
            path = ".".join(components) or "root"
            paths.append(path[:VALIDATION_LOG_MAX_PATH_LENGTH])

            error_type = error.get("type")
            error_types.append(
                error_type
                if (
                    type(error_type) is str
                    and len(error_type) <= VALIDATION_LOG_MAX_COMPONENT_LENGTH
                    and _SAFE_VALIDATION_TYPE.fullmatch(error_type)
                )
                else "validation_error"
            )

        logger.warning(
            "document_analysis_provider_failure "
            "provider=%s category=invalid_response model=%s "
            "exception_type=ValidationError validation_error_count=%s "
            "validation_paths=%s validation_types=%s",
            OPENAI_PROVIDER_NAME,
            self._model,
            len(errors),
            ",".join(paths),
            ",".join(error_types),
        )

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
                    content=_map_structured_content(question.content),
                    answer_options=tuple(
                        DocumentAnalysisAnswerOption(
                            label=option.label,
                            text=option.text,
                            content=None,
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
