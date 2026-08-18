from __future__ import annotations

import sys
import unittest
import uuid
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from pypdf import PdfWriter

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.pdf_source_pre_analysis_processor import (
    PDF_MIME_TYPE,
    PDF_PAGE_IMAGE_PRESENT,
    PDF_PAGE_IMAGE_PRESENT_MESSAGE,
    PDF_PAGE_NO_EXTRACTABLE_TEXT,
    PDF_PAGE_NO_EXTRACTABLE_TEXT_MESSAGE,
    PDF_PAGE_RESOURCE_INSPECTION_FAILED,
    PDF_PAGE_RESOURCE_INSPECTION_FAILED_MESSAGE,
    PDF_PAGE_TEXT_EXTRACTION_FAILED,
    PDF_PAGE_TEXT_EXTRACTION_FAILED_MESSAGE,
    PDF_PROCESSOR_NAME,
    PDF_PROCESSOR_VERSION,
    PdfSourcePreAnalysisEmptyDocumentError,
    PdfSourcePreAnalysisEncryptedError,
    PdfSourcePreAnalysisProcessor,
    PdfSourcePreAnalysisUnreadableError,
    PdfSourcePreAnalysisValidationError,
)
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    validate_processor_execution,
)


class FakePage:
    def __init__(
        self,
        *,
        text: str | None = "text",
        text_error: Exception | None = None,
        resources: object = None,
        resource_error: Exception | None = None,
    ) -> None:
        self.text = text
        self.text_error = text_error
        self.resources = resources
        self.resource_error = resource_error
        self.extract_calls = 0

    def extract_text(self) -> str | None:
        self.extract_calls += 1
        if self.text_error is not None:
            raise self.text_error
        return self.text

    def get(self, key: str) -> object:
        if self.resource_error is not None:
            raise self.resource_error
        if key == "/Resources":
            return self.resources
        return None


class PdfSourcePreAnalysisProcessorTest(unittest.TestCase):
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

    @staticmethod
    def _source(
        stream: BytesIO,
        *,
        mime_type: str = PDF_MIME_TYPE,
    ) -> ResolvedSourceBinary:
        return ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type=mime_type,
            original_filename="book.pdf",
            size_bytes=max(len(stream.getvalue()), 1),
            width_px=None,
            height_px=None,
            stream=stream,
        )

    def test_contract_page_count_findings_and_provenance_are_exact(self) -> None:
        processor = PdfSourcePreAnalysisProcessor()
        stream = BytesIO(self._pdf_bytes(page_count=2))
        stream.seek(7)

        execution = processor.process(source=self._source(stream))

        self.assertEqual(processor.supported_mime_types, {PDF_MIME_TYPE})
        self.assertIsInstance(execution, SourcePreAnalysisProcessorExecution)
        self.assertEqual(execution.result.schema_version, 1)
        self.assertEqual(execution.result.page_count, 2)
        self.assertEqual(stream.tell(), 7)
        self.assertFalse(stream.closed)
        self.assertEqual(
            [finding.finding_code for finding in execution.result.findings],
            [PDF_PAGE_NO_EXTRACTABLE_TEXT] * 2,
        )
        self.assertEqual(
            [finding.page_number for finding in execution.result.findings],
            [1, 2],
        )
        for finding in execution.result.findings:
            self.assertIs(
                finding.severity,
                SourcePreAnalysisFindingSeverity.WARNING,
            )
            self.assertIsNone(finding.confidence)
            self.assertEqual(
                finding.message,
                PDF_PAGE_NO_EXTRACTABLE_TEXT_MESSAGE,
            )
        provenance = execution.provenance
        self.assertEqual(provenance.processor_name, PDF_PROCESSOR_NAME)
        self.assertEqual(provenance.processor_version, PDF_PROCESSOR_VERSION)
        self.assertIsNone(provenance.provider_name)
        self.assertIsNone(provenance.model_name)
        self.assertIsNone(provenance.prompt_version)
        self.assertEqual(validate_processor_execution(execution), execution)

    def test_wrong_source_contract_and_mime_are_rejected(self) -> None:
        processor = PdfSourcePreAnalysisProcessor()
        with self.assertRaises(PdfSourcePreAnalysisValidationError):
            processor.process(source=object())  # type: ignore[arg-type]
        stream = BytesIO(b"not relevant")
        with self.assertRaises(PdfSourcePreAnalysisValidationError):
            processor.process(
                source=self._source(stream, mime_type="image/png"),
            )
        self.assertFalse(stream.closed)

    def test_stream_starts_at_zero_and_restores_after_failure(self) -> None:
        processor = PdfSourcePreAnalysisProcessor()
        stream = BytesIO(b"not a PDF")
        stream.seek(4)
        with self.assertRaises(PdfSourcePreAnalysisUnreadableError):
            processor.process(source=self._source(stream))
        self.assertEqual(stream.tell(), 4)
        self.assertFalse(stream.closed)

    def test_unusable_stream_and_restore_failure_are_fatal(self) -> None:
        class UnusableStream(BytesIO):
            def tell(self) -> int:
                raise OSError("not seekable")

        unusable = UnusableStream(b"pdf")
        with self.assertRaises(PdfSourcePreAnalysisValidationError):
            PdfSourcePreAnalysisProcessor().process(
                source=self._source(unusable),
            )
        self.assertFalse(unusable.closed)

        class RestoreFailureStream(BytesIO):
            def __init__(self, value: bytes) -> None:
                super().__init__(value)
                self.fail_restore = False

            def seek(self, offset: int, whence: int = 0) -> int:
                if self.fail_restore and offset == 5 and whence == 0:
                    raise OSError("restore failed")
                return super().seek(offset, whence)

        restore_stream = RestoreFailureStream(b"placeholder")
        restore_stream.seek(5)
        page = FakePage(text="content")
        reader = SimpleNamespace(is_encrypted=False, pages=[page])
        restore_stream.fail_restore = True
        with patch(
            "app.services.pdf_source_pre_analysis_processor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfSourcePreAnalysisUnreadableError):
            PdfSourcePreAnalysisProcessor().process(
                source=self._source(restore_stream),
            )
        self.assertFalse(restore_stream.closed)

    def test_zero_page_encrypted_and_malformed_pdfs_fail(self) -> None:
        cases = (
            (
                self._pdf_bytes(page_count=0),
                PdfSourcePreAnalysisEmptyDocumentError,
            ),
            (
                self._pdf_bytes(page_count=1, encrypted=True),
                PdfSourcePreAnalysisEncryptedError,
            ),
            (b"%PDF-truncated", PdfSourcePreAnalysisUnreadableError),
        )
        for content, error_type in cases:
            with self.subTest(error=error_type.__name__):
                stream = BytesIO(content)
                stream.seek(min(3, len(content)))
                original_position = stream.tell()
                with self.assertRaises(error_type):
                    PdfSourcePreAnalysisProcessor().process(
                        source=self._source(stream),
                    )
                self.assertEqual(stream.tell(), original_position)
                self.assertFalse(stream.closed)

    def test_irrecoverable_page_access_failure_is_fatal(self) -> None:
        class BrokenPages:
            def __len__(self) -> int:
                return 1

            def __getitem__(self, index: int) -> object:
                raise ValueError("broken page tree")

        reader = SimpleNamespace(is_encrypted=False, pages=BrokenPages())
        stream = BytesIO(b"placeholder")
        with patch(
            "app.services.pdf_source_pre_analysis_processor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfSourcePreAnalysisUnreadableError):
            PdfSourcePreAnalysisProcessor().process(
                source=self._source(stream),
            )
        self.assertFalse(stream.closed)

    def test_text_outcomes_are_exact_and_extracted_text_is_not_exposed(self) -> None:
        secret_text = "private mathematical source text"
        pages = (
            FakePage(text=None),
            FakePage(text="   \n"),
            FakePage(text=secret_text),
            FakePage(text_error=ValueError("private parser detail")),
        )
        reader = SimpleNamespace(is_encrypted=False, pages=list(pages))
        stream = BytesIO(b"placeholder")
        with patch(
            "app.services.pdf_source_pre_analysis_processor.PdfReader",
            return_value=reader,
        ):
            execution = PdfSourcePreAnalysisProcessor().process(
                source=self._source(stream),
            )

        findings = execution.result.findings
        self.assertEqual([page.extract_calls for page in pages], [1, 1, 1, 1])
        self.assertEqual(
            [(finding.page_number, finding.finding_code) for finding in findings],
            [
                (1, PDF_PAGE_NO_EXTRACTABLE_TEXT),
                (2, PDF_PAGE_NO_EXTRACTABLE_TEXT),
                (4, PDF_PAGE_TEXT_EXTRACTION_FAILED),
            ],
        )
        self.assertEqual(
            findings[-1].message,
            PDF_PAGE_TEXT_EXTRACTION_FAILED_MESSAGE,
        )
        self.assertIs(
            findings[-1].severity,
            SourcePreAnalysisFindingSeverity.WARNING,
        )
        self.assertTrue(all(finding.confidence is None for finding in findings))
        self.assertNotIn(secret_text, repr(execution))
        self.assertNotIn("private parser detail", repr(execution))

    def test_image_and_resource_findings_are_once_per_page_and_ordered(self) -> None:
        image = {"/Subtype": "/Image", "/Data": b"private-image"}
        resources = {
            "/XObject": {
                "/Image1": image,
                "/Image2": {"/Subtype": "/Image"},
            }
        }
        pages = [
            FakePage(text=None, resources=resources),
            FakePage(text="content", resources={"/XObject": {}}),
            FakePage(
                text="content",
                resource_error=ValueError("private object id"),
            ),
        ]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)
        stream = BytesIO(b"placeholder")
        with patch(
            "app.services.pdf_source_pre_analysis_processor.PdfReader",
            return_value=reader,
        ):
            execution = PdfSourcePreAnalysisProcessor().process(
                source=self._source(stream),
            )

        findings = execution.result.findings
        self.assertEqual(
            [(finding.page_number, finding.finding_code) for finding in findings],
            [
                (1, PDF_PAGE_NO_EXTRACTABLE_TEXT),
                (1, PDF_PAGE_IMAGE_PRESENT),
                (3, PDF_PAGE_RESOURCE_INSPECTION_FAILED),
            ],
        )
        image_finding = findings[1]
        self.assertIs(image_finding.severity, SourcePreAnalysisFindingSeverity.INFO)
        self.assertIsNone(image_finding.confidence)
        self.assertEqual(image_finding.message, PDF_PAGE_IMAGE_PRESENT_MESSAGE)
        resource_finding = findings[2]
        self.assertIs(
            resource_finding.severity,
            SourcePreAnalysisFindingSeverity.WARNING,
        )
        self.assertEqual(
            resource_finding.message,
            PDF_PAGE_RESOURCE_INSPECTION_FAILED_MESSAGE,
        )
        self.assertNotIn("private-image", repr(execution))
        self.assertNotIn("private object id", repr(execution))
        self.assertEqual(validate_processor_execution(execution), execution)


if __name__ == "__main__":
    unittest.main()
