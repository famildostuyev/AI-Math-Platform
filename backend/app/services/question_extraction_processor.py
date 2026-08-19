from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import BinaryIO, Protocol


class QuestionExtractionProcessorError(Exception):
    """Base exception for question extraction processor-contract failures."""


class QuestionExtractionUnsupportedMimeError(QuestionExtractionProcessorError):
    """Raised when no registered processor owns a MIME type."""


class QuestionExtractionProcessorDeclarationError(
    QuestionExtractionProcessorError
):
    """Raised when a processor registration is invalid or ambiguous."""


class QuestionExtractionProcessorResultError(
    QuestionExtractionProcessorError
):
    """Raised when processor output violates the internal result contract."""


class QuestionExtractionProcessorCandidateError(
    QuestionExtractionProcessorResultError
):
    """Raised when one extracted candidate is invalid."""


class QuestionExtractionProcessorProvenanceError(
    QuestionExtractionProcessorError
):
    """Raised when execution provenance violates the processor contract."""


@dataclass(frozen=True, slots=True)
class ResolvedQuestionExtractionSourceBinary:
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    mime_type: str
    original_filename: str | None
    size_bytes: int
    width_px: int | None
    height_px: int | None
    stream: BinaryIO


@dataclass(frozen=True, slots=True)
class QuestionExtractionProcessorCandidate:
    page_number: int | None
    extracted_text: str
    confidence: Decimal | None


@dataclass(frozen=True, slots=True)
class QuestionExtractionProcessorResult:
    schema_version: int
    candidates: tuple[QuestionExtractionProcessorCandidate, ...]


@dataclass(frozen=True, slots=True)
class QuestionExtractionProcessorProvenance:
    processor_name: str
    processor_version: str
    provider_name: str | None = None
    model_name: str | None = None
    prompt_version: str | None = None


@dataclass(frozen=True, slots=True)
class QuestionExtractionProcessorExecution:
    result: QuestionExtractionProcessorResult
    provenance: QuestionExtractionProcessorProvenance


class QuestionExtractionProcessor(Protocol):
    supported_mime_types: frozenset[str]

    def process(
        self,
        *,
        source: ResolvedQuestionExtractionSourceBinary,
    ) -> QuestionExtractionProcessorExecution:
        ...


class QuestionExtractionProcessorSelector(Protocol):
    def select(self, *, mime_type: str) -> QuestionExtractionProcessor:
        ...


class RegisteredQuestionExtractionProcessorSelector:
    """Select injected processors by exact canonical MIME ownership."""

    def __init__(
        self,
        processors: tuple[QuestionExtractionProcessor, ...],
    ) -> None:
        registry: dict[str, QuestionExtractionProcessor] = {}
        for processor in processors:
            self._validate_processor(processor)
            for mime_type in processor.supported_mime_types:
                if mime_type in registry:
                    raise QuestionExtractionProcessorDeclarationError(
                        "Multiple processors claim the same MIME type."
                    )
                registry[mime_type] = processor
        self._registry = registry

    @staticmethod
    def _validate_processor(
        processor: QuestionExtractionProcessor,
    ) -> None:
        supported_mime_types = getattr(
            processor,
            "supported_mime_types",
            None,
        )
        process = getattr(processor, "process", None)

        if (
            not isinstance(supported_mime_types, frozenset)
            or not supported_mime_types
            or not callable(process)
        ):
            raise QuestionExtractionProcessorDeclarationError(
                "Processor declaration is invalid."
            )

        if any(
            not isinstance(mime_type, str)
            or not mime_type
            or mime_type != mime_type.strip()
            for mime_type in supported_mime_types
        ):
            raise QuestionExtractionProcessorDeclarationError(
                "Processor MIME declaration is invalid."
            )

    def select(
        self,
        *,
        mime_type: str,
    ) -> QuestionExtractionProcessor:
        if not isinstance(mime_type, str):
            raise QuestionExtractionUnsupportedMimeError(
                "No processor supports the supplied MIME type."
            )

        processor = self._registry.get(mime_type)
        if processor is None:
            raise QuestionExtractionUnsupportedMimeError(
                "No processor supports the supplied MIME type."
            )
        return processor


_STABLE_IDENTIFIER = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
_VERSION_IDENTIFIER = re.compile(
    r"^[A-Za-z0-9]+(?:[._:+/-][A-Za-z0-9]+)*$"
)


def _normalize_required_identifier(
    value: object,
    *,
    label: str,
    maximum_length: int,
) -> str:
    if not isinstance(value, str):
        raise QuestionExtractionProcessorProvenanceError(
            f"{label} must be a string."
        )

    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > maximum_length
        or _STABLE_IDENTIFIER.fullmatch(normalized) is None
    ):
        raise QuestionExtractionProcessorProvenanceError(
            f"{label} is invalid."
        )

    return normalized


def _normalize_optional_text(
    value: object,
    *,
    label: str,
    maximum_length: int,
) -> str | None:
    if value is None:
        return None

    if not isinstance(value, str):
        raise QuestionExtractionProcessorProvenanceError(
            f"{label} must be a string or null."
        )

    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > maximum_length
        or any(character in normalized for character in "\r\n")
    ):
        raise QuestionExtractionProcessorProvenanceError(
            f"{label} is invalid."
        )

    return normalized


def _normalize_optional_version_identifier(
    value: object,
    *,
    label: str,
    maximum_length: int,
) -> str | None:
    normalized = _normalize_optional_text(
        value,
        label=label,
        maximum_length=maximum_length,
    )

    if (
        normalized is not None
        and _VERSION_IDENTIFIER.fullmatch(normalized) is None
    ):
        raise QuestionExtractionProcessorProvenanceError(
            f"{label} is invalid."
        )

    return normalized


def validate_processor_provenance(
    provenance: QuestionExtractionProcessorProvenance,
) -> QuestionExtractionProcessorProvenance:
    """Validate and normalize immutable provenance for one execution."""

    if not isinstance(provenance, QuestionExtractionProcessorProvenance):
        raise QuestionExtractionProcessorProvenanceError(
            "Processor provenance has an invalid type."
        )

    processor_name = _normalize_required_identifier(
        provenance.processor_name,
        label="Processor name",
        maximum_length=100,
    )

    processor_version = _normalize_optional_text(
        provenance.processor_version,
        label="Processor version",
        maximum_length=100,
    )
    if processor_version is None:
        raise QuestionExtractionProcessorProvenanceError(
            "Processor version is required."
        )

    provider_name = None
    if provenance.provider_name is not None:
        provider_name = _normalize_required_identifier(
            provenance.provider_name,
            label="Provider name",
            maximum_length=100,
        )

    return QuestionExtractionProcessorProvenance(
        processor_name=processor_name,
        processor_version=processor_version,
        provider_name=provider_name,
        model_name=_normalize_optional_text(
            provenance.model_name,
            label="Model name",
            maximum_length=200,
        ),
        prompt_version=_normalize_optional_version_identifier(
            provenance.prompt_version,
            label="Prompt version",
            maximum_length=100,
        ),
    )


def validate_processor_result(
    result: QuestionExtractionProcessorResult,
) -> QuestionExtractionProcessorResult:
    """Validate and normalize immutable extraction output."""

    if not isinstance(result, QuestionExtractionProcessorResult):
        raise QuestionExtractionProcessorResultError(
            "Processor result has an invalid type."
        )

    if (
        not isinstance(result.schema_version, int)
        or isinstance(result.schema_version, bool)
        or result.schema_version <= 0
    ):
        raise QuestionExtractionProcessorResultError(
            "Processor schema version must be a positive integer."
        )

    if not isinstance(result.candidates, tuple):
        raise QuestionExtractionProcessorResultError(
            "Processor candidates must be a tuple."
        )

    normalized_candidates: list[
        QuestionExtractionProcessorCandidate
    ] = []

    for candidate in result.candidates:
        if not isinstance(candidate, QuestionExtractionProcessorCandidate):
            raise QuestionExtractionProcessorCandidateError(
                "Processor candidate has an invalid type."
            )

        if candidate.page_number is not None and (
            not isinstance(candidate.page_number, int)
            or isinstance(candidate.page_number, bool)
            or candidate.page_number <= 0
        ):
            raise QuestionExtractionProcessorCandidateError(
                "Candidate page number must be a positive integer or null."
            )

        if not isinstance(candidate.extracted_text, str):
            raise QuestionExtractionProcessorCandidateError(
                "Candidate text must be a string."
            )

        extracted_text = candidate.extracted_text.strip()
        if not extracted_text:
            raise QuestionExtractionProcessorCandidateError(
                "Candidate text cannot be blank."
            )

        if candidate.confidence is not None:
            if not isinstance(candidate.confidence, Decimal):
                raise QuestionExtractionProcessorCandidateError(
                    "Candidate confidence must be a Decimal or null."
                )

            if (
                not candidate.confidence.is_finite()
                or candidate.confidence < Decimal("0")
                or candidate.confidence > Decimal("1")
            ):
                raise QuestionExtractionProcessorCandidateError(
                    "Candidate confidence must be between 0 and 1."
                )

        normalized_candidates.append(
            QuestionExtractionProcessorCandidate(
                page_number=candidate.page_number,
                extracted_text=extracted_text,
                confidence=candidate.confidence,
            )
        )

    return QuestionExtractionProcessorResult(
        schema_version=result.schema_version,
        candidates=tuple(normalized_candidates),
    )


def validate_processor_execution(
    execution: QuestionExtractionProcessorExecution,
) -> QuestionExtractionProcessorExecution:
    """Validate and normalize processor result and provenance together."""

    if not isinstance(execution, QuestionExtractionProcessorExecution):
        raise QuestionExtractionProcessorProvenanceError(
            "Processor execution has an invalid type."
        )

    return QuestionExtractionProcessorExecution(
        result=validate_processor_result(execution.result),
        provenance=validate_processor_provenance(execution.provenance),
    )
