from __future__ import annotations

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError

from app.services.question_extraction_processor import (
    QuestionExtractionProcessorCandidate,
    QuestionExtractionProcessorExecution,
    QuestionExtractionProcessorProvenance,
    QuestionExtractionProcessorResult,
    ResolvedQuestionExtractionSourceBinary,
)


PDF_MIME_TYPE = "application/pdf"
PDF_PROCESSOR_NAME = "pdf-question-extraction"
PDF_PROCESSOR_VERSION = "1"


class PdfQuestionExtractionProcessorError(Exception):
    """Base exception for deterministic PDF question extraction failures."""


class PdfQuestionExtractionValidationError(
    PdfQuestionExtractionProcessorError
):
    """Raised when the resolved PDF source contract is invalid."""


class PdfQuestionExtractionUnreadableError(
    PdfQuestionExtractionProcessorError
):
    """Raised when PDF structure, pages, or source stream cannot be read."""


class PdfQuestionExtractionEncryptedError(
    PdfQuestionExtractionProcessorError
):
    """Raised when an encrypted PDF reaches question extraction."""


class PdfQuestionExtractionEmptyDocumentError(
    PdfQuestionExtractionProcessorError
):
    """Raised when a PDF has no physical pages."""


class PdfQuestionExtractionProcessor:
    """Extract deterministic page-scoped text candidates from one PDF."""

    supported_mime_types = frozenset({PDF_MIME_TYPE})

    def process(
        self,
        *,
        source: ResolvedQuestionExtractionSourceBinary,
    ) -> QuestionExtractionProcessorExecution:
        if type(source) is not ResolvedQuestionExtractionSourceBinary:
            raise PdfQuestionExtractionValidationError(
                "Resolved PDF source is invalid."
            )
        if source.mime_type != PDF_MIME_TYPE:
            raise PdfQuestionExtractionValidationError(
                "Resolved source MIME type is not PDF."
            )

        stream = source.stream
        try:
            original_position = stream.tell()
            stream.seek(0)
        except Exception as exc:
            raise PdfQuestionExtractionValidationError(
                "Resolved PDF stream must be seekable."
            ) from exc

        try:
            execution = self._process_stream(stream)
        finally:
            try:
                stream.seek(original_position)
            except Exception as exc:
                raise PdfQuestionExtractionUnreadableError(
                    "PDF stream position could not be restored."
                ) from exc

        return execution

    def _process_stream(
        self,
        stream: object,
    ) -> QuestionExtractionProcessorExecution:
        try:
            reader = PdfReader(stream, strict=True)

            if reader.is_encrypted:
                raise PdfQuestionExtractionEncryptedError(
                    "Encrypted PDF sources are unsupported."
                )

            page_count = len(reader.pages)
            if type(page_count) is not int:
                raise PdfQuestionExtractionUnreadableError(
                    "PDF physical page count is invalid."
                )
            if page_count == 0:
                raise PdfQuestionExtractionEmptyDocumentError(
                    "PDF source contains no physical pages."
                )
            if page_count < 0:
                raise PdfQuestionExtractionUnreadableError(
                    "PDF physical page count is invalid."
                )

            candidates: list[QuestionExtractionProcessorCandidate] = []

            for page_index in range(page_count):
                page = reader.pages[page_index]
                page_number = page_index + 1

                try:
                    text = page.extract_text()
                except Exception as exc:
                    raise PdfQuestionExtractionUnreadableError(
                        "PDF page text could not be extracted."
                    ) from exc

                if not isinstance(text, str):
                    continue

                normalized_text = text.strip()
                if not normalized_text:
                    continue

                candidates.append(
                    QuestionExtractionProcessorCandidate(
                        page_number=page_number,
                        extracted_text=normalized_text,
                        confidence=None,
                    )
                )

        except (
            PdfQuestionExtractionEncryptedError,
            PdfQuestionExtractionEmptyDocumentError,
            PdfQuestionExtractionUnreadableError,
        ):
            raise
        except FileNotDecryptedError as exc:
            raise PdfQuestionExtractionEncryptedError(
                "Encrypted PDF sources are unsupported."
            ) from exc
        except (
            PdfReadError,
            OSError,
            ValueError,
            TypeError,
            KeyError,
        ) as exc:
            raise PdfQuestionExtractionUnreadableError(
                "PDF source structure is unreadable."
            ) from exc
        except Exception as exc:
            raise PdfQuestionExtractionUnreadableError(
                "PDF source could not be processed."
            ) from exc

        return QuestionExtractionProcessorExecution(
            result=QuestionExtractionProcessorResult(
                schema_version=1,
                candidates=tuple(candidates),
            ),
            provenance=QuestionExtractionProcessorProvenance(
                processor_name=PDF_PROCESSOR_NAME,
                processor_version=PDF_PROCESSOR_VERSION,
                provider_name=None,
                model_name=None,
                prompt_version=None,
            ),
        )
