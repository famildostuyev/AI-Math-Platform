from __future__ import annotations

import uuid
from io import BytesIO
from typing import BinaryIO

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError

from app.services.document_analysis_provider import DocumentAnalysisPageReference
from app.services.pdf_page_renderer import PdfPageRenderer, PdfPageRenderingError
from app.services.raw_document import RawDocument, RawDocumentPage


PDF_RAW_EXTRACTION_METHOD = "pdf_text_layer"
PDF_RAW_EXTRACTION_VERSION = "1"


class PdfRawDocumentExtractionError(Exception):
    """Base exception for deterministic raw PDF page extraction failures."""


class PdfRawDocumentValidationError(PdfRawDocumentExtractionError):
    """Raised when raw PDF extraction input is invalid."""


class PdfRawDocumentUnreadableError(PdfRawDocumentExtractionError):
    """Raised when PDF structure, pages, or stream cannot be read."""


class PdfRawDocumentEncryptedError(PdfRawDocumentExtractionError):
    """Raised when encrypted PDF content reaches raw extraction."""


class PdfRawDocumentEmptyError(PdfRawDocumentExtractionError):
    """Raised when a PDF has no physical pages."""


class PdfRawDocumentExtractor:
    """Create provider-neutral raw material for every physical PDF page."""

    def __init__(self, *, page_renderer: PdfPageRenderer | None = None) -> None:
        self.page_renderer = page_renderer or PdfPageRenderer()

    def extract(
        self,
        *,
        source_document_id: uuid.UUID,
        source_pages: tuple[DocumentAnalysisPageReference, ...],
        stream: BinaryIO,
    ) -> RawDocument:
        if type(source_document_id) is not uuid.UUID:
            raise PdfRawDocumentValidationError(
                "Source document ID must be a UUID."
            )
        if not isinstance(source_pages, tuple) or any(
            not isinstance(page, DocumentAnalysisPageReference)
            for page in source_pages
        ):
            raise PdfRawDocumentValidationError(
                "Source page identities are invalid."
            )

        try:
            original_position = stream.tell()
            stream.seek(0)
        except Exception as exc:
            raise PdfRawDocumentValidationError(
                "Resolved PDF stream must be seekable."
            ) from exc

        try:
            pdf_content = stream.read()
            if not isinstance(pdf_content, bytes) or not pdf_content:
                raise PdfRawDocumentUnreadableError(
                    "PDF source structure is unreadable."
                )
            return self._extract_stream(
                source_document_id=source_document_id,
                source_pages=source_pages,
                pdf_content=pdf_content,
            )
        finally:
            try:
                stream.seek(original_position)
            except Exception as exc:
                raise PdfRawDocumentUnreadableError(
                    "PDF stream position could not be restored."
                ) from exc

    def _extract_stream(
        self,
        *,
        source_document_id: uuid.UUID,
        source_pages: tuple[DocumentAnalysisPageReference, ...],
        pdf_content: bytes,
    ) -> RawDocument:
        try:
            reader = PdfReader(BytesIO(pdf_content), strict=True)
            if reader.is_encrypted:
                raise PdfRawDocumentEncryptedError(
                    "Encrypted PDF sources are unsupported."
                )

            page_count = len(reader.pages)
            if type(page_count) is not int or page_count < 0:
                raise PdfRawDocumentUnreadableError(
                    "PDF physical page count is invalid."
                )
            if page_count == 0:
                raise PdfRawDocumentEmptyError(
                    "PDF source contains no physical pages."
                )
            if len(source_pages) != page_count or tuple(
                page.page_number for page in source_pages
            ) != tuple(range(1, page_count + 1)):
                raise PdfRawDocumentValidationError(
                    "Source page identities do not match physical PDF pages."
                )

            raw_pages: list[RawDocumentPage] = []
            for page_index in range(page_count):
                try:
                    extracted_text = reader.pages[page_index].extract_text()
                except Exception as exc:
                    raise PdfRawDocumentUnreadableError(
                        "PDF page text could not be extracted."
                    ) from exc

                raw_text = extracted_text if isinstance(extracted_text, str) else ""
                identity = source_pages[page_index]
                try:
                    visual_content = self.page_renderer.render_page(
                        pdf_content=pdf_content,
                        page_number=identity.page_number,
                    )
                except PdfPageRenderingError:
                    visual_content = None
                raw_pages.append(
                    RawDocumentPage(
                        source_document_page_id=identity.source_document_page_id,
                        page_number=identity.page_number,
                        raw_text=raw_text,
                        visual_content=visual_content,
                        extraction_method=PDF_RAW_EXTRACTION_METHOD,
                        extraction_version=PDF_RAW_EXTRACTION_VERSION,
                    )
                )

            return RawDocument(
                source_document_id=source_document_id,
                pages=tuple(raw_pages),
            )
        except (
            PdfRawDocumentEncryptedError,
            PdfRawDocumentEmptyError,
            PdfRawDocumentUnreadableError,
            PdfRawDocumentValidationError,
        ):
            raise
        except FileNotDecryptedError as exc:
            raise PdfRawDocumentEncryptedError(
                "Encrypted PDF sources are unsupported."
            ) from exc
        except (PdfReadError, OSError, ValueError, TypeError, KeyError) as exc:
            raise PdfRawDocumentUnreadableError(
                "PDF source structure is unreadable."
            ) from exc
        except Exception as exc:
            raise PdfRawDocumentUnreadableError(
                "PDF source could not be processed."
            ) from exc
