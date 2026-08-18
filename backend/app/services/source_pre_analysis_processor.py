from __future__ import annotations

import uuid
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import BinaryIO, Protocol

from app.core.enums import SourcePreAnalysisFindingSeverity


class SourcePreAnalysisProcessorError(Exception):
    """Base exception for processor-contract failures."""


class SourcePreAnalysisUnsupportedMimeError(SourcePreAnalysisProcessorError):
    """Raised when no registered processor owns a MIME type."""


class SourcePreAnalysisProcessorDeclarationError(
    SourcePreAnalysisProcessorError
):
    """Raised when a processor registration is invalid or ambiguous."""


class SourcePreAnalysisProcessorResultError(SourcePreAnalysisProcessorError):
    """Raised when processor output violates the internal result contract."""


class SourcePreAnalysisProcessorFindingError(
    SourcePreAnalysisProcessorResultError
):
    """Raised when one processor finding is invalid."""


class SourcePreAnalysisProcessorProvenanceError(
    SourcePreAnalysisProcessorError
):
    """Raised when execution provenance violates the processor contract."""


@dataclass(frozen=True, slots=True)
class ResolvedSourceBinary:
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    mime_type: str
    original_filename: str | None
    size_bytes: int
    width_px: int | None
    height_px: int | None
    stream: BinaryIO


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisProcessorFinding:
    page_number: int | None
    finding_code: str
    severity: SourcePreAnalysisFindingSeverity
    confidence: Decimal | None
    message: str


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisProcessorResult:
    schema_version: int
    page_count: int | None
    findings: tuple[SourcePreAnalysisProcessorFinding, ...]


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisProcessorProvenance:
    processor_name: str
    processor_version: str
    provider_name: str | None = None
    model_name: str | None = None
    prompt_version: str | None = None


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisProcessorExecution:
    result: SourcePreAnalysisProcessorResult
    provenance: SourcePreAnalysisProcessorProvenance


class SourcePreAnalysisProcessor(Protocol):
    supported_mime_types: frozenset[str]

    def process(
        self,
        *,
        source: ResolvedSourceBinary,
    ) -> SourcePreAnalysisProcessorExecution:
        ...


class SourcePreAnalysisProcessorSelector(Protocol):
    def select(self, *, mime_type: str) -> SourcePreAnalysisProcessor:
        ...


class RegisteredSourcePreAnalysisProcessorSelector:
    """Select injected processors by exact canonical MIME ownership."""

    def __init__(self, processors: tuple[SourcePreAnalysisProcessor, ...]) -> None:
        registry: dict[str, SourcePreAnalysisProcessor] = {}
        for processor in processors:
            self._validate_processor(processor)
            for mime_type in processor.supported_mime_types:
                if mime_type in registry:
                    raise SourcePreAnalysisProcessorDeclarationError(
                        "Multiple processors claim the same MIME type."
                    )
                registry[mime_type] = processor
        self._registry = registry

    @staticmethod
    def _validate_processor(processor: SourcePreAnalysisProcessor) -> None:
        supported_mime_types = getattr(processor, "supported_mime_types", None)
        process = getattr(processor, "process", None)
        if (
            not isinstance(supported_mime_types, frozenset)
            or not supported_mime_types
            or not callable(process)
        ):
            raise SourcePreAnalysisProcessorDeclarationError(
                "Processor declaration is invalid."
            )
        if any(
            not isinstance(mime_type, str)
            or not mime_type
            or mime_type != mime_type.strip()
            for mime_type in supported_mime_types
        ):
            raise SourcePreAnalysisProcessorDeclarationError(
                "Processor MIME declaration is invalid."
            )

    def select(self, *, mime_type: str) -> SourcePreAnalysisProcessor:
        if not isinstance(mime_type, str):
            raise SourcePreAnalysisUnsupportedMimeError(
                "No processor supports the supplied MIME type."
            )
        processor = self._registry.get(mime_type)
        if processor is None:
            raise SourcePreAnalysisUnsupportedMimeError(
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
        raise SourcePreAnalysisProcessorProvenanceError(
            f"{label} must be a string."
        )
    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > maximum_length
        or _STABLE_IDENTIFIER.fullmatch(normalized) is None
    ):
        raise SourcePreAnalysisProcessorProvenanceError(
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
        raise SourcePreAnalysisProcessorProvenanceError(
            f"{label} must be a string or null."
        )
    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > maximum_length
        or any(character in normalized for character in "\r\n")
    ):
        raise SourcePreAnalysisProcessorProvenanceError(
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
    if normalized is not None and _VERSION_IDENTIFIER.fullmatch(normalized) is None:
        raise SourcePreAnalysisProcessorProvenanceError(
            f"{label} is invalid."
        )
    return normalized


def validate_processor_provenance(
    provenance: SourcePreAnalysisProcessorProvenance,
) -> SourcePreAnalysisProcessorProvenance:
    """Validate and normalize immutable provenance for one execution."""

    if not isinstance(provenance, SourcePreAnalysisProcessorProvenance):
        raise SourcePreAnalysisProcessorProvenanceError(
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
        raise SourcePreAnalysisProcessorProvenanceError(
            "Processor version is required."
        )
    provider_name = None
    if provenance.provider_name is not None:
        provider_name = _normalize_required_identifier(
            provenance.provider_name,
            label="Provider name",
            maximum_length=100,
        )
    return SourcePreAnalysisProcessorProvenance(
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


def validate_processor_execution(
    execution: SourcePreAnalysisProcessorExecution,
) -> SourcePreAnalysisProcessorExecution:
    """Validate and normalize the result and provenance of one execution."""

    if not isinstance(execution, SourcePreAnalysisProcessorExecution):
        raise SourcePreAnalysisProcessorProvenanceError(
            "Processor execution has an invalid type."
        )
    return SourcePreAnalysisProcessorExecution(
        result=validate_processor_result(execution.result),
        provenance=validate_processor_provenance(execution.provenance),
    )


def validate_processor_result(
    result: SourcePreAnalysisProcessorResult,
) -> SourcePreAnalysisProcessorResult:
    """Validate and normalize immutable processor output for later mapping."""

    if not isinstance(result, SourcePreAnalysisProcessorResult):
        raise SourcePreAnalysisProcessorResultError(
            "Processor result has an invalid type."
        )
    if (
        not isinstance(result.schema_version, int)
        or isinstance(result.schema_version, bool)
        or result.schema_version <= 0
    ):
        raise SourcePreAnalysisProcessorResultError(
            "Processor schema version must be a positive integer."
        )
    if result.page_count is not None and (
        not isinstance(result.page_count, int)
        or isinstance(result.page_count, bool)
        or result.page_count < 0
    ):
        raise SourcePreAnalysisProcessorResultError(
            "Processor page count must be a non-negative integer or null."
        )
    if not isinstance(result.findings, tuple):
        raise SourcePreAnalysisProcessorResultError(
            "Processor findings must be a tuple."
        )

    normalized_findings: list[SourcePreAnalysisProcessorFinding] = []
    for finding in result.findings:
        if not isinstance(finding, SourcePreAnalysisProcessorFinding):
            raise SourcePreAnalysisProcessorFindingError(
                "Processor finding has an invalid type."
            )
        if finding.page_number is not None and (
            not isinstance(finding.page_number, int)
            or isinstance(finding.page_number, bool)
            or finding.page_number <= 0
        ):
            raise SourcePreAnalysisProcessorFindingError(
                "Finding page number must be a positive integer or null."
            )
        if not isinstance(finding.finding_code, str):
            raise SourcePreAnalysisProcessorFindingError(
                "Finding code must be a string."
            )
        finding_code = finding.finding_code.strip()
        if not finding_code or len(finding_code) > 100:
            raise SourcePreAnalysisProcessorFindingError(
                "Finding code must contain 1 to 100 characters."
            )
        if not isinstance(finding.severity, SourcePreAnalysisFindingSeverity):
            raise SourcePreAnalysisProcessorFindingError(
                "Finding severity is invalid."
            )
        if finding.confidence is not None:
            if not isinstance(finding.confidence, Decimal):
                raise SourcePreAnalysisProcessorFindingError(
                    "Finding confidence must be a Decimal or null."
                )
            if (
                not finding.confidence.is_finite()
                or finding.confidence < Decimal("0")
                or finding.confidence > Decimal("1")
            ):
                raise SourcePreAnalysisProcessorFindingError(
                    "Finding confidence must be between 0 and 1."
                )
        if not isinstance(finding.message, str):
            raise SourcePreAnalysisProcessorFindingError(
                "Finding message must be a string."
            )
        message = finding.message.strip()
        if not message:
            raise SourcePreAnalysisProcessorFindingError(
                "Finding message cannot be blank."
            )
        normalized_findings.append(
            SourcePreAnalysisProcessorFinding(
                page_number=finding.page_number,
                finding_code=finding_code,
                severity=finding.severity,
                confidence=finding.confidence,
                message=message,
            )
        )

    return SourcePreAnalysisProcessorResult(
        schema_version=result.schema_version,
        page_count=result.page_count,
        findings=tuple(normalized_findings),
    )
