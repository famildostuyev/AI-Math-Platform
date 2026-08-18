from __future__ import annotations

import uuid
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


class SourcePreAnalysisProcessor(Protocol):
    processor_name: str
    processor_version: str
    supported_mime_types: frozenset[str]

    def process(
        self,
        *,
        source: ResolvedSourceBinary,
    ) -> SourcePreAnalysisProcessorResult:
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
        processor_name = getattr(processor, "processor_name", None)
        processor_version = getattr(processor, "processor_version", None)
        supported_mime_types = getattr(processor, "supported_mime_types", None)
        process = getattr(processor, "process", None)
        if (
            not isinstance(processor_name, str)
            or not processor_name.strip()
            or not isinstance(processor_version, str)
            or not processor_version.strip()
            or not isinstance(supported_mime_types, frozenset)
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
