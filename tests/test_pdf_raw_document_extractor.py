from __future__ import annotations

import sys
import unittest
import uuid
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError
from pypdf import PdfWriter


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.document_analysis_provider import (
    DocumentAnalysisPageReference,
    DocumentAnalysisPageVisual,
)
from app.services.pdf_raw_document_extractor import (
    PDF_RAW_EXTRACTION_METHOD,
    PDF_RAW_EXTRACTION_VERSION,
    PdfRawDocumentEmptyError,
    PdfRawDocumentEncryptedError,
    PdfRawDocumentExtractor,
    PdfRawDocumentUnreadableError,
    PdfRawDocumentValidationError,
)
from app.services.raw_document import RawDocumentPage


class FakePage:
    def __init__(self, text: str | None = "text", error: Exception | None = None):
        self.text = text
        self.error = error
        self.extract_calls = 0

    def extract_text(self) -> str | None:
        self.extract_calls += 1
        if self.error is not None:
            raise self.error
        return self.text


class PdfRawDocumentExtractorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.document_id = uuid.uuid4()

    @staticmethod
    def _identities(count: int) -> tuple[DocumentAnalysisPageReference, ...]:
        return tuple(
            DocumentAnalysisPageReference(
                source_document_page_id=uuid.uuid4(), page_number=number,
            )
            for number in range(1, count + 1)
        )

    @staticmethod
    def _pdf_bytes(*, page_count: int, encrypted: bool = False) -> bytes:
        writer = PdfWriter()
        for _ in range(page_count):
            writer.add_blank_page(width=72, height=72)
        if encrypted:
            writer.encrypt("secret")
        stream = BytesIO()
        writer.write(stream)
        return stream.getvalue()

    def _extract(self, pages: list[FakePage]):
        stream = BytesIO(b"placeholder")
        identities = self._identities(len(pages))
        reader = SimpleNamespace(is_encrypted=False, pages=pages)
        with patch(
            "app.services.pdf_raw_document_extractor.PdfReader",
            return_value=reader,
        ):
            result = PdfRawDocumentExtractor().extract(
                source_document_id=self.document_id,
                source_pages=identities,
                stream=stream,
            )
        return result, identities, stream

    def test_one_page_pdf_produces_one_raw_page(self) -> None:
        result, _, _ = self._extract([FakePage("Question text")])
        self.assertEqual(len(result.pages), 1)

    def test_multi_page_pdf_preserves_one_based_deterministic_order(self) -> None:
        pages = [FakePage("A"), FakePage("B"), FakePage("C")]
        result, _, _ = self._extract(pages)
        self.assertEqual([page.page_number for page in result.pages], [1, 2, 3])
        self.assertEqual([page.raw_text for page in result.pages], ["A", "B", "C"])
        self.assertEqual([page.extract_calls for page in pages], [1, 1, 1])

    def test_source_page_identity_is_preserved(self) -> None:
        result, identities, _ = self._extract([FakePage("A"), FakePage("B")])
        self.assertEqual(
            [page.source_document_page_id for page in result.pages],
            [page.source_document_page_id for page in identities],
        )

    def test_raw_text_is_preserved_without_normalization(self) -> None:
        result, _, _ = self._extract([FakePage("  Raw text\n")])
        self.assertEqual(result.pages[0].raw_text, "  Raw text\n")

    def test_empty_text_page_still_produces_raw_material(self) -> None:
        result, _, _ = self._extract([FakePage(None), FakePage("   ")])
        self.assertEqual(len(result.pages), 2)
        self.assertEqual([page.raw_text for page in result.pages], ["", "   "])

    def test_visual_only_page_contract_accepts_optional_visual_content(self) -> None:
        page = RawDocumentPage(
            source_document_page_id=uuid.uuid4(), page_number=1, raw_text="",
            visual_content=DocumentAnalysisPageVisual(
                mime_type="image/png", content=b"page-image",
            ),
            extraction_method=PDF_RAW_EXTRACTION_METHOD,
            extraction_version=PDF_RAW_EXTRACTION_VERSION,
        )
        self.assertEqual(page.raw_text, "")
        self.assertEqual(page.visual_content.content, b"page-image")

    def test_extraction_method_and_version_are_explicit(self) -> None:
        result, _, _ = self._extract([FakePage("A")])
        self.assertEqual(result.pages[0].extraction_method, "pdf_text_layer")
        self.assertEqual(result.pages[0].extraction_version, "1")

    def test_provider_specific_fields_are_rejected_and_absent(self) -> None:
        fields = set(RawDocumentPage.model_fields)
        self.assertTrue(
            {"openai_file_id", "provider_page_id", "provider_response"}
            .isdisjoint(fields)
        )
        valid = {
            "source_document_page_id": uuid.uuid4(), "page_number": 1,
            "raw_text": "A", "visual_content": None,
            "extraction_method": "pdf_text_layer", "extraction_version": "1",
            "openai_file_id": "file-id",
        }
        with self.assertRaises(ValidationError):
            RawDocumentPage.model_validate(valid)

    def test_page_identity_must_match_physical_pdf_pages(self) -> None:
        reader = SimpleNamespace(is_encrypted=False, pages=[FakePage("A")])
        with patch(
            "app.services.pdf_raw_document_extractor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfRawDocumentValidationError):
            PdfRawDocumentExtractor().extract(
                source_document_id=self.document_id,
                source_pages=(),
                stream=BytesIO(b"placeholder"),
            )

    def test_unreadable_page_is_fatal_and_detail_is_not_exposed(self) -> None:
        private_detail = "private parser detail"
        reader = SimpleNamespace(
            is_encrypted=False,
            pages=[FakePage(error=ValueError(private_detail))],
        )
        with patch(
            "app.services.pdf_raw_document_extractor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfRawDocumentUnreadableError) as captured:
            PdfRawDocumentExtractor().extract(
                source_document_id=self.document_id,
                source_pages=self._identities(1),
                stream=BytesIO(b"placeholder"),
            )
        self.assertNotIn(private_detail, str(captured.exception))

    def test_empty_encrypted_and_malformed_pdfs_follow_existing_convention(self) -> None:
        cases = (
            (self._pdf_bytes(page_count=0), PdfRawDocumentEmptyError),
            (self._pdf_bytes(page_count=1, encrypted=True),
             PdfRawDocumentEncryptedError),
            (b"%PDF-truncated", PdfRawDocumentUnreadableError),
        )
        for content, error in cases:
            with self.subTest(error=error.__name__), self.assertRaises(error):
                PdfRawDocumentExtractor().extract(
                    source_document_id=self.document_id,
                    source_pages=self._identities(1),
                    stream=BytesIO(content),
                )

    def test_stream_position_is_restored_after_success_and_failure(self) -> None:
        success_pages = [FakePage("A")]
        success_stream = BytesIO(b"placeholder")
        success_stream.seek(4)
        with patch(
            "app.services.pdf_raw_document_extractor.PdfReader",
            return_value=SimpleNamespace(is_encrypted=False, pages=success_pages),
        ):
            PdfRawDocumentExtractor().extract(
                source_document_id=self.document_id,
                source_pages=self._identities(1),
                stream=success_stream,
            )
        self.assertEqual(success_stream.tell(), 4)

        failure_stream = BytesIO(b"not a PDF")
        failure_stream.seek(3)
        with self.assertRaises(PdfRawDocumentUnreadableError):
            PdfRawDocumentExtractor().extract(
                source_document_id=self.document_id,
                source_pages=self._identities(1),
                stream=failure_stream,
            )
        self.assertEqual(failure_stream.tell(), 3)


if __name__ == "__main__":
    unittest.main()
