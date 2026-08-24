from __future__ import annotations

import pymupdf

from app.services.document_analysis_provider import DocumentAnalysisPageVisual


PDF_PAGE_VISUAL_MIME_TYPE = "image/png"
PDF_PAGE_RENDER_DPI = 150


class PdfPageRenderingError(Exception):
    """Base exception for provider-neutral PDF page rendering failures."""


class PdfPageRenderingValidationError(PdfPageRenderingError):
    """Raised when a PDF page rendering request is invalid."""


class PdfPageRenderingUnavailableError(PdfPageRenderingError):
    """Raised when a requested PDF page cannot be rendered safely."""


class PdfPageRenderer:
    """Render one physical PDF page at a time as provider-neutral PNG bytes."""

    def render_page(
        self,
        *,
        pdf_content: bytes,
        page_number: int,
    ) -> DocumentAnalysisPageVisual:
        if not isinstance(pdf_content, bytes) or not pdf_content:
            raise PdfPageRenderingValidationError(
                "PDF rendering content must be non-empty bytes."
            )
        if (
            not isinstance(page_number, int)
            or isinstance(page_number, bool)
            or page_number <= 0
        ):
            raise PdfPageRenderingValidationError(
                "PDF page number must be a positive integer."
            )

        try:
            with pymupdf.open(stream=pdf_content, filetype="pdf") as document:
                if page_number > document.page_count:
                    raise PdfPageRenderingValidationError(
                        "PDF page number is outside the document."
                    )
                page = document.load_page(page_number - 1)
                pixmap = page.get_pixmap(
                    dpi=PDF_PAGE_RENDER_DPI,
                    colorspace=pymupdf.csRGB,
                    alpha=False,
                )
                rendered = pixmap.tobytes("png")
        except PdfPageRenderingValidationError:
            raise
        except Exception as exc:
            raise PdfPageRenderingUnavailableError(
                "PDF page visual could not be rendered."
            ) from exc

        if not rendered:
            raise PdfPageRenderingUnavailableError(
                "PDF page visual could not be rendered."
            )
        return DocumentAnalysisPageVisual(
            mime_type=PDF_PAGE_VISUAL_MIME_TYPE,
            content=rendered,
        )
