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

from app.services.pdf_question_extraction_processor import (
    PDF_MIME_TYPE,
    PDF_PROCESSOR_NAME,
    PDF_PROCESSOR_VERSION,
    PdfQuestionExtractionEmptyDocumentError,
    PdfQuestionExtractionEncryptedError,
    PdfQuestionExtractionProcessor,
    PdfQuestionExtractionUnreadableError,
    PdfQuestionExtractionValidationError,
)
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorExecution,
    ResolvedQuestionExtractionSourceBinary,
    validate_processor_execution,
)


class FakePage:
    def __init__(
        self,
        *,
        text: str | None = "text",
        text_error: Exception | None = None,
    ) -> None:
        self.text = text
        self.text_error = text_error
        self.extract_calls = 0

    def extract_text(self) -> str | None:
        self.extract_calls += 1
        if self.text_error is not None:
            raise self.text_error
        return self.text


class PdfQuestionExtractionProcessorTest(unittest.TestCase):
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
    ) -> ResolvedQuestionExtractionSourceBinary:
        return ResolvedQuestionExtractionSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type=mime_type,
            original_filename="book.pdf",
            size_bytes=max(len(stream.getvalue()), 1),
            width_px=None,
            height_px=None,
            stream=stream,
        )

    def test_contract_candidates_provenance_and_stream_position_are_exact(
        self,
    ) -> None:
        pages = [
            FakePage(text="  1. Find x.  "),
            FakePage(text=" \n\t "),
        ]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)
        stream = BytesIO(b"placeholder")
        stream.seek(4)

        with patch(
            "app.services.pdf_question_extraction_processor.PdfReader",
            return_value=reader,
        ):
            execution = PdfQuestionExtractionProcessor().process(
                source=self._source(stream),
            )

        self.assertEqual(
            PdfQuestionExtractionProcessor().supported_mime_types,
            {PDF_MIME_TYPE},
        )
        self.assertIsInstance(
            execution,
            QuestionExtractionProcessorExecution,
        )
        self.assertEqual(execution.result.schema_version, 1)
        self.assertEqual(len(execution.result.candidates), 1)

        candidate = execution.result.candidates[0]
        self.assertEqual(candidate.page_number, 1)
        self.assertEqual(candidate.extracted_text, "1. Find x.")
        self.assertIsNone(candidate.confidence)

        provenance = execution.provenance
        self.assertEqual(provenance.processor_name, PDF_PROCESSOR_NAME)
        self.assertEqual(
            provenance.processor_version,
            PDF_PROCESSOR_VERSION,
        )
        self.assertIsNone(provenance.provider_name)
        self.assertIsNone(provenance.model_name)
        self.assertIsNone(provenance.prompt_version)

        self.assertEqual(validate_processor_execution(execution), execution)
        self.assertEqual(stream.tell(), 4)
        self.assertFalse(stream.closed)
        self.assertEqual([page.extract_calls for page in pages], [1, 1])

    def test_wrong_source_contract_and_mime_are_rejected(self) -> None:
        processor = PdfQuestionExtractionProcessor()

        with self.assertRaises(PdfQuestionExtractionValidationError):
            processor.process(source=object())  # type: ignore[arg-type]

        stream = BytesIO(b"not relevant")
        with self.assertRaises(PdfQuestionExtractionValidationError):
            processor.process(
                source=self._source(stream, mime_type="image/png"),
            )

        self.assertFalse(stream.closed)

    def test_stream_starts_at_zero_and_restores_after_failure(self) -> None:
        processor = PdfQuestionExtractionProcessor()
        stream = BytesIO(b"not a PDF")
        stream.seek(4)

        with self.assertRaises(PdfQuestionExtractionUnreadableError):
            processor.process(source=self._source(stream))

        self.assertEqual(stream.tell(), 4)
        self.assertFalse(stream.closed)

    def test_unusable_stream_and_restore_failure_are_fatal(self) -> None:
        class UnusableStream(BytesIO):
            def tell(self) -> int:
                raise OSError("not seekable")

        unusable = UnusableStream(b"pdf")
        with self.assertRaises(PdfQuestionExtractionValidationError):
            PdfQuestionExtractionProcessor().process(
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
        reader = SimpleNamespace(
            is_encrypted=False,
            pages=[FakePage(text="1. Find x.")],
        )
        restore_stream.fail_restore = True

        with patch(
            "app.services.pdf_question_extraction_processor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfQuestionExtractionUnreadableError):
            PdfQuestionExtractionProcessor().process(
                source=self._source(restore_stream),
            )

        self.assertFalse(restore_stream.closed)

    def test_zero_page_encrypted_and_malformed_pdfs_fail(self) -> None:
        cases = (
            (
                self._pdf_bytes(page_count=0),
                PdfQuestionExtractionEmptyDocumentError,
            ),
            (
                self._pdf_bytes(page_count=1, encrypted=True),
                PdfQuestionExtractionEncryptedError,
            ),
            (
                b"%PDF-truncated",
                PdfQuestionExtractionUnreadableError,
            ),
        )

        for content, error_type in cases:
            with self.subTest(error=error_type.__name__):
                stream = BytesIO(content)
                stream.seek(min(3, len(content)))
                original_position = stream.tell()

                with self.assertRaises(error_type):
                    PdfQuestionExtractionProcessor().process(
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

        reader = SimpleNamespace(
            is_encrypted=False,
            pages=BrokenPages(),
        )
        stream = BytesIO(b"placeholder")

        with patch(
            "app.services.pdf_question_extraction_processor.PdfReader",
            return_value=reader,
        ), self.assertRaises(PdfQuestionExtractionUnreadableError):
            PdfQuestionExtractionProcessor().process(
                source=self._source(stream),
            )

        self.assertFalse(stream.closed)

    def test_text_pages_become_page_scoped_candidates_in_order(self) -> None:
        pages = [
            FakePage(text=None),
            FakePage(text="   "),
            FakePage(text="  Question A  "),
            FakePage(text="\nQuestion B\n"),
        ]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)
        stream = BytesIO(b"placeholder")

        with patch(
            "app.services.pdf_question_extraction_processor.PdfReader",
            return_value=reader,
        ):
            execution = PdfQuestionExtractionProcessor().process(
                source=self._source(stream),
            )

        self.assertEqual(
            [
                (candidate.page_number, candidate.extracted_text)
                for candidate in execution.result.candidates
            ],
            [
                (3, "Question A"),
                (4, "Question B"),
            ],
        )
        self.assertTrue(
            all(
                candidate.confidence is None
                for candidate in execution.result.candidates
            )
        )
        self.assertEqual([page.extract_calls for page in pages], [1, 1, 1, 1])

    def test_page_text_extraction_failure_is_fatal_and_private_detail_not_exposed(
        self,
    ) -> None:
        private_detail = "private parser object 771"
        pages = [
            FakePage(text="Question A"),
            FakePage(text_error=ValueError(private_detail)),
        ]
        reader = SimpleNamespace(is_encrypted=False, pages=pages)
        stream = BytesIO(b"placeholder")

        with patch(
            "app.services.pdf_question_extraction_processor.PdfReader",
            return_value=reader,
        ):
            with self.assertRaises(
                PdfQuestionExtractionUnreadableError
            ) as captured:
                PdfQuestionExtractionProcessor().process(
                    source=self._source(stream),
                )

        self.assertNotIn(private_detail, str(captured.exception))
        self.assertEqual([page.extract_calls for page in pages], [1, 1])
        self.assertFalse(stream.closed)


if __name__ == "__main__":
    unittest.main()
