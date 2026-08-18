from __future__ import annotations

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    SourcePreAnalysisProcessorFinding,
    SourcePreAnalysisProcessorProvenance,
    SourcePreAnalysisProcessorResult,
)


PDF_MIME_TYPE = "application/pdf"
PDF_PROCESSOR_NAME = "pdf-pre-analysis"
PDF_PROCESSOR_VERSION = "1"

PDF_PAGE_NO_EXTRACTABLE_TEXT = "pdf_page_no_extractable_text"
PDF_PAGE_TEXT_EXTRACTION_FAILED = "pdf_page_text_extraction_failed"
PDF_PAGE_IMAGE_PRESENT = "pdf_page_image_present"
PDF_PAGE_RESOURCE_INSPECTION_FAILED = (
    "pdf_page_resource_inspection_failed"
)

PDF_PAGE_NO_EXTRACTABLE_TEXT_MESSAGE = (
    "No extractable text was detected on this page."
)
PDF_PAGE_TEXT_EXTRACTION_FAILED_MESSAGE = (
    "Text could not be extracted from this page."
)
PDF_PAGE_IMAGE_PRESENT_MESSAGE = "Page contains embedded image content."
PDF_PAGE_RESOURCE_INSPECTION_FAILED_MESSAGE = (
    "Page image resources could not be inspected."
)


class PdfSourcePreAnalysisProcessorError(Exception):
    """Base exception for deterministic PDF pre-analysis failures."""


class PdfSourcePreAnalysisValidationError(
    PdfSourcePreAnalysisProcessorError
):
    """Raised when the resolved PDF source contract is invalid."""


class PdfSourcePreAnalysisUnreadableError(
    PdfSourcePreAnalysisProcessorError
):
    """Raised when PDF structure or its source stream cannot be read."""


class PdfSourcePreAnalysisEncryptedError(
    PdfSourcePreAnalysisProcessorError
):
    """Raised when an encrypted PDF reaches pre-analysis."""


class PdfSourcePreAnalysisEmptyDocumentError(
    PdfSourcePreAnalysisProcessorError
):
    """Raised when a PDF has no physical pages."""


class PdfSourcePreAnalysisProcessor:
    """Produce deterministic lightweight structure findings for one PDF."""

    supported_mime_types = frozenset({PDF_MIME_TYPE})

    def process(
        self,
        *,
        source: ResolvedSourceBinary,
    ) -> SourcePreAnalysisProcessorExecution:
        if type(source) is not ResolvedSourceBinary:
            raise PdfSourcePreAnalysisValidationError(
                "Resolved PDF source is invalid."
            )
        if source.mime_type != PDF_MIME_TYPE:
            raise PdfSourcePreAnalysisValidationError(
                "Resolved source MIME type is not PDF."
            )

        stream = source.stream
        try:
            original_position = stream.tell()
            stream.seek(0)
        except Exception as exc:
            raise PdfSourcePreAnalysisValidationError(
                "Resolved PDF stream must be seekable."
            ) from exc

        try:
            execution = self._process_stream(stream)
        finally:
            try:
                stream.seek(original_position)
            except Exception as exc:
                raise PdfSourcePreAnalysisUnreadableError(
                    "PDF stream position could not be restored."
                ) from exc
        return execution

    def _process_stream(self, stream: object) -> SourcePreAnalysisProcessorExecution:
        try:
            reader = PdfReader(stream, strict=True)
            if reader.is_encrypted:
                raise PdfSourcePreAnalysisEncryptedError(
                    "Encrypted PDF sources are unsupported."
                )
            page_count = len(reader.pages)
            if type(page_count) is not int:
                raise PdfSourcePreAnalysisUnreadableError(
                    "PDF physical page count is invalid."
                )
            if page_count == 0:
                raise PdfSourcePreAnalysisEmptyDocumentError(
                    "PDF source contains no physical pages."
                )
            if page_count < 0:
                raise PdfSourcePreAnalysisUnreadableError(
                    "PDF physical page count is invalid."
                )

            findings: list[SourcePreAnalysisProcessorFinding] = []
            for page_index in range(page_count):
                page = reader.pages[page_index]
                page_number = page_index + 1
                findings.extend(
                    self._inspect_page_text(page, page_number=page_number)
                )
                findings.extend(
                    self._inspect_page_images(page, page_number=page_number)
                )
        except (
            PdfSourcePreAnalysisEncryptedError,
            PdfSourcePreAnalysisEmptyDocumentError,
            PdfSourcePreAnalysisUnreadableError,
        ):
            raise
        except FileNotDecryptedError as exc:
            raise PdfSourcePreAnalysisEncryptedError(
                "Encrypted PDF sources are unsupported."
            ) from exc
        except (PdfReadError, OSError, ValueError, TypeError, KeyError) as exc:
            raise PdfSourcePreAnalysisUnreadableError(
                "PDF source structure is unreadable."
            ) from exc
        except Exception as exc:
            raise PdfSourcePreAnalysisUnreadableError(
                "PDF source could not be processed."
            ) from exc

        return SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=page_count,
                findings=tuple(findings),
            ),
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name=PDF_PROCESSOR_NAME,
                processor_version=PDF_PROCESSOR_VERSION,
                provider_name=None,
                model_name=None,
                prompt_version=None,
            ),
        )

    @staticmethod
    def _inspect_page_text(
        page: object,
        *,
        page_number: int,
    ) -> tuple[SourcePreAnalysisProcessorFinding, ...]:
        try:
            text = page.extract_text()
        except Exception:
            return (
                SourcePreAnalysisProcessorFinding(
                    page_number=page_number,
                    finding_code=PDF_PAGE_TEXT_EXTRACTION_FAILED,
                    severity=SourcePreAnalysisFindingSeverity.WARNING,
                    confidence=None,
                    message=PDF_PAGE_TEXT_EXTRACTION_FAILED_MESSAGE,
                ),
            )
        if isinstance(text, str) and text.strip():
            return ()
        return (
            SourcePreAnalysisProcessorFinding(
                page_number=page_number,
                finding_code=PDF_PAGE_NO_EXTRACTABLE_TEXT,
                severity=SourcePreAnalysisFindingSeverity.WARNING,
                confidence=None,
                message=PDF_PAGE_NO_EXTRACTABLE_TEXT_MESSAGE,
            ),
        )

    @classmethod
    def _inspect_page_images(
        cls,
        page: object,
        *,
        page_number: int,
    ) -> tuple[SourcePreAnalysisProcessorFinding, ...]:
        try:
            resources = cls._resolve_pdf_object(page.get("/Resources"))
            if resources is None:
                return ()
            xobjects = cls._resolve_pdf_object(resources.get("/XObject"))
            if xobjects is None:
                return ()
            has_image = any(
                cls._resolve_pdf_object(value).get("/Subtype") == "/Image"
                for value in xobjects.values()
            )
        except Exception:
            return (
                SourcePreAnalysisProcessorFinding(
                    page_number=page_number,
                    finding_code=PDF_PAGE_RESOURCE_INSPECTION_FAILED,
                    severity=SourcePreAnalysisFindingSeverity.WARNING,
                    confidence=None,
                    message=PDF_PAGE_RESOURCE_INSPECTION_FAILED_MESSAGE,
                ),
            )
        if not has_image:
            return ()
        return (
            SourcePreAnalysisProcessorFinding(
                page_number=page_number,
                finding_code=PDF_PAGE_IMAGE_PRESENT,
                severity=SourcePreAnalysisFindingSeverity.INFO,
                confidence=None,
                message=PDF_PAGE_IMAGE_PRESENT_MESSAGE,
            ),
        )

    @staticmethod
    def _resolve_pdf_object(value: object) -> object:
        get_object = getattr(value, "get_object", None)
        return get_object() if callable(get_object) else value
