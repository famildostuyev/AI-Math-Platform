from __future__ import annotations

import sys
import unittest
import uuid
from io import BytesIO
from pathlib import Path

from pydantic import ValidationError
from pypdf import PdfWriter


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.document_analysis_provider import (
    DocumentAnalysisPageReference,
    DocumentAnalysisPageVisual,
)
from app.services.pdf_page_renderer import (
    PDF_PAGE_VISUAL_MIME_TYPE,
    PdfPageRenderer,
    PdfPageRenderingUnavailableError,
    PdfPageRenderingValidationError,
)
from app.services.pdf_raw_document_extractor import PdfRawDocumentExtractor


def make_pdf(page_count: int) -> bytes:
    writer = PdfWriter()
    for number in range(page_count):
        writer.add_blank_page(width=72 + number, height=72 + number)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class FailingRenderer:
    def render_page(
        self, *, pdf_content: bytes, page_number: int,
    ) -> DocumentAnalysisPageVisual:
        raise PdfPageRenderingUnavailableError("render failed")


class RecordingRenderer:
    def __init__(self) -> None:
        self.page_numbers: list[int] = []

    def render_page(
        self, *, pdf_content: bytes, page_number: int,
    ) -> DocumentAnalysisPageVisual:
        self.page_numbers.append(page_number)
        return DocumentAnalysisPageVisual(
            mime_type="image/png",
            content=f"page-{page_number}".encode(),
        )


class PdfPageRendererTest(unittest.TestCase):
    def setUp(self) -> None:
        self.renderer = PdfPageRenderer()

    @staticmethod
    def identities(count: int) -> tuple[DocumentAnalysisPageReference, ...]:
        return tuple(
            DocumentAnalysisPageReference(
                source_document_page_id=uuid.uuid4(),
                page_number=number,
            )
            for number in range(1, count + 1)
        )

    def test_one_page_pdf_produces_one_visual(self) -> None:
        visual = self.renderer.render_page(
            pdf_content=make_pdf(1), page_number=1,
        )
        self.assertIsInstance(visual, DocumentAnalysisPageVisual)

    def test_multi_page_pdf_produces_a_visual_for_each_page(self) -> None:
        content = make_pdf(3)
        visuals = [
            self.renderer.render_page(pdf_content=content, page_number=number)
            for number in range(1, 4)
        ]
        self.assertEqual(len(visuals), 3)
        self.assertTrue(all(visual.content for visual in visuals))

    def test_page_numbering_is_one_based(self) -> None:
        content = make_pdf(2)
        with self.assertRaises(PdfPageRenderingValidationError):
            self.renderer.render_page(pdf_content=content, page_number=0)
        self.renderer.render_page(pdf_content=content, page_number=1)

    def test_visual_mime_type_is_png(self) -> None:
        visual = self.renderer.render_page(
            pdf_content=make_pdf(1), page_number=1,
        )
        self.assertEqual(visual.mime_type, PDF_PAGE_VISUAL_MIME_TYPE)

    def test_visual_bytes_are_non_empty_png(self) -> None:
        visual = self.renderer.render_page(
            pdf_content=make_pdf(1), page_number=1,
        )
        self.assertTrue(visual.content.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_raw_text_and_visual_keep_the_same_page_identity(self) -> None:
        identity = self.identities(1)
        result = PdfRawDocumentExtractor().extract(
            source_document_id=uuid.uuid4(),
            source_pages=identity,
            stream=BytesIO(make_pdf(1)),
        )
        self.assertEqual(
            result.pages[0].source_document_page_id,
            identity[0].source_document_page_id,
        )
        self.assertIsNotNone(result.pages[0].visual_content)

    def test_empty_text_page_still_has_a_visual(self) -> None:
        result = PdfRawDocumentExtractor().extract(
            source_document_id=uuid.uuid4(),
            source_pages=self.identities(1),
            stream=BytesIO(make_pdf(1)),
        )
        self.assertEqual(result.pages[0].raw_text, "")
        self.assertIsNotNone(result.pages[0].visual_content)

    def test_page_order_is_preserved_during_integration(self) -> None:
        renderer = RecordingRenderer()
        identities = self.identities(3)
        result = PdfRawDocumentExtractor(page_renderer=renderer).extract(
            source_document_id=uuid.uuid4(),
            source_pages=identities,
            stream=BytesIO(make_pdf(3)),
        )
        self.assertEqual(renderer.page_numbers, [1, 2, 3])
        self.assertEqual([page.page_number for page in result.pages], [1, 2, 3])

    def test_render_failure_falls_back_without_losing_raw_pages(self) -> None:
        identities = self.identities(2)
        result = PdfRawDocumentExtractor(
            page_renderer=FailingRenderer(),
        ).extract(
            source_document_id=uuid.uuid4(),
            source_pages=identities,
            stream=BytesIO(make_pdf(2)),
        )
        self.assertEqual(len(result.pages), 2)
        self.assertEqual([page.raw_text for page in result.pages], ["", ""])
        self.assertTrue(all(page.visual_content is None for page in result.pages))

    def test_invalid_page_numbers_are_rejected(self) -> None:
        content = make_pdf(1)
        for page_number in (-1, 0, 2, True):
            with self.subTest(page_number=page_number), self.assertRaises(
                PdfPageRenderingValidationError
            ):
                self.renderer.render_page(
                    pdf_content=content, page_number=page_number,
                )

    def test_invalid_pdf_content_is_rejected_without_private_detail(self) -> None:
        with self.assertRaises(PdfPageRenderingUnavailableError) as captured:
            self.renderer.render_page(
                pdf_content=b"not-a-pdf-private-detail", page_number=1,
            )
        self.assertNotIn("private-detail", str(captured.exception))

    def test_provider_specific_fields_are_absent_and_rejected(self) -> None:
        fields = set(DocumentAnalysisPageVisual.model_fields)
        self.assertTrue(
            {"openai_file_id", "provider_url", "provider_image"}.isdisjoint(
                fields
            )
        )
        with self.assertRaises(ValidationError):
            DocumentAnalysisPageVisual.model_validate(
                {
                    "mime_type": "image/png",
                    "content": b"png",
                    "openai_file_id": "file-private",
                }
            )

    def test_existing_source_page_identities_are_not_replaced(self) -> None:
        identities = self.identities(2)
        result = PdfRawDocumentExtractor().extract(
            source_document_id=uuid.uuid4(),
            source_pages=identities,
            stream=BytesIO(make_pdf(2)),
        )
        self.assertEqual(
            tuple(page.source_document_page_id for page in result.pages),
            tuple(page.source_document_page_id for page in identities),
        )

    def test_minimal_real_pdf_rendering_does_not_write_a_fixture(self) -> None:
        visual = self.renderer.render_page(
            pdf_content=make_pdf(1), page_number=1,
        )
        self.assertGreater(len(visual.content), 8)
        self.assertEqual(visual.mime_type, "image/png")


if __name__ == "__main__":
    unittest.main()
