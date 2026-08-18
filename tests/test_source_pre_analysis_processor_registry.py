from __future__ import annotations

import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from pypdf import PdfWriter
from PIL import Image

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.pdf_source_pre_analysis_processor import (
    PDF_PAGE_NO_EXTRACTABLE_TEXT,
    PDF_PROCESSOR_NAME,
    PDF_PROCESSOR_VERSION,
    PdfSourcePreAnalysisProcessor,
)
from app.services.image_source_pre_analysis_processor import (
    IMAGE_PROCESSOR_NAME,
    IMAGE_PROCESSOR_VERSION,
    ImageSourcePreAnalysisProcessor,
)
from app.services.source_pre_analysis_execution_service import (
    SourcePreAnalysisExecutionService,
)
from app.services.source_pre_analysis_output_service import (
    SourcePreAnalysisPreparedOutput,
)
from app.services.source_pre_analysis_processor import (
    RegisteredSourcePreAnalysisProcessorSelector,
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorDeclarationError,
    SourcePreAnalysisUnsupportedMimeError,
)
from app.services.source_pre_analysis_processor_registry import (
    build_source_pre_analysis_processor_selector,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisFindingInput,
    SourcePreAnalysisResultInput,
)


class SourcePreAnalysisProcessorRegistryTest(unittest.TestCase):
    @staticmethod
    def _blank_pdf() -> bytes:
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        stream = BytesIO()
        writer.write(stream)
        return stream.getvalue()

    def test_factory_registers_pdf_and_images_with_fresh_state(self) -> None:
        first = build_source_pre_analysis_processor_selector()
        second = build_source_pre_analysis_processor_selector()

        self.assertIsInstance(
            first,
            RegisteredSourcePreAnalysisProcessorSelector,
        )
        self.assertIsInstance(
            second,
            RegisteredSourcePreAnalysisProcessorSelector,
        )
        first_pdf = first.select(mime_type="application/pdf")
        second_pdf = second.select(mime_type="application/pdf")
        self.assertIsInstance(first_pdf, PdfSourcePreAnalysisProcessor)
        self.assertIsInstance(second_pdf, PdfSourcePreAnalysisProcessor)
        self.assertIsNot(first, second)
        self.assertIsNot(first_pdf, second_pdf)

        for mime_type in ("image/png", "image/jpeg", "image/webp"):
            with self.subTest(mime_type=mime_type):
                first_image = first.select(mime_type=mime_type)
                second_image = second.select(mime_type=mime_type)
                self.assertIsInstance(
                    first_image,
                    ImageSourcePreAnalysisProcessor,
                )
                self.assertIsInstance(
                    second_image,
                    ImageSourcePreAnalysisProcessor,
                )
                self.assertIsNot(first_image, second_image)

        unsupported = (
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document",
        )
        for mime_type in unsupported:
            with self.subTest(mime_type=mime_type), self.assertRaises(
                SourcePreAnalysisUnsupportedMimeError,
            ):
                first.select(mime_type=mime_type)

    def test_existing_selector_rejects_duplicate_pdf_ownership(self) -> None:
        with self.assertRaises(SourcePreAnalysisProcessorDeclarationError):
            RegisteredSourcePreAnalysisProcessorSelector(
                processors=(
                    PdfSourcePreAnalysisProcessor(),
                    PdfSourcePreAnalysisProcessor(),
                ),
            )

        with self.assertRaises(SourcePreAnalysisProcessorDeclarationError):
            RegisteredSourcePreAnalysisProcessorSelector(
                processors=(
                    ImageSourcePreAnalysisProcessor(),
                    ImageSourcePreAnalysisProcessor(),
                ),
            )

    def test_real_pdf_processor_runs_through_trusted_execution_service(
        self,
    ) -> None:
        run_id = uuid.uuid4()
        stream = BytesIO(self._blank_pdf())
        source = ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type="application/pdf",
            original_filename="book.pdf",
            size_bytes=len(stream.getvalue()),
            width_px=None,
            height_px=None,
            stream=stream,
        )
        lifecycle = MagicMock()
        source_service = MagicMock()
        output_service = MagicMock()
        prepared_finding = SourcePreAnalysisFindingInput(
            source_document_page_id=uuid.uuid4(),
            finding_code=PDF_PAGE_NO_EXTRACTABLE_TEXT,
            severity=SourcePreAnalysisFindingSeverity.WARNING,
            confidence=None,
            message="No extractable text was detected on this page.",
        )
        prepared = SourcePreAnalysisPreparedOutput(
            result=SourcePreAnalysisResultInput(
                schema_version=1,
                page_count=1,
            ),
            findings=(prepared_finding,),
        )
        finalization = object()

        @contextmanager
        def opened_source():
            try:
                yield source
            finally:
                stream.close()

        source_service.open_for_run.return_value = opened_source()

        def prepare_output(**kwargs):
            self.assertTrue(stream.closed)
            result = kwargs["processor_result"]
            self.assertEqual(result.page_count, 1)
            self.assertEqual(result.schema_version, 1)
            self.assertEqual(len(result.findings), 1)
            self.assertEqual(
                result.findings[0].finding_code,
                PDF_PAGE_NO_EXTRACTABLE_TEXT,
            )
            return prepared

        output_service.prepare_finalization_inputs.side_effect = prepare_output
        lifecycle.finalize_success.return_value = finalization

        returned = SourcePreAnalysisExecutionService(
            MagicMock(),
            processor_selector=(
                build_source_pre_analysis_processor_selector()
            ),
            lifecycle_service=lifecycle,
            source_service=source_service,
            output_service=output_service,
        ).execute_run(run_id=run_id)

        self.assertIs(returned, finalization)
        lifecycle.start_run.assert_called_once_with(run_id=run_id)
        source_service.open_for_run.assert_called_once_with(run_id=run_id)
        output_service.prepare_finalization_inputs.assert_called_once()
        delegated = lifecycle.finalize_success.call_args.kwargs
        self.assertEqual(delegated["run_id"], run_id)
        self.assertIs(delegated["result"], prepared.result)
        self.assertIs(delegated["findings"], prepared.findings)
        provenance = delegated["provenance"]
        self.assertEqual(provenance.processor_name, PDF_PROCESSOR_NAME)
        self.assertEqual(provenance.processor_version, PDF_PROCESSOR_VERSION)
        self.assertIsNone(provenance.provider_name)
        self.assertIsNone(provenance.model_name)
        self.assertIsNone(provenance.prompt_version)
        lifecycle.mark_failed.assert_not_called()
        self.assertTrue(stream.closed)

    def test_real_image_processor_runs_through_trusted_execution_service(
        self,
    ) -> None:
        run_id = uuid.uuid4()
        image = Image.new("RGB", (3, 2), (20, 40, 60))
        stream = BytesIO()
        image.save(stream, format="PNG")
        content = stream.getvalue()
        stream = BytesIO(content)
        source = ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type="image/png",
            original_filename="source.png",
            size_bytes=len(content),
            width_px=3,
            height_px=2,
            stream=stream,
        )
        lifecycle = MagicMock()
        source_service = MagicMock()
        output_service = MagicMock()
        prepared = SourcePreAnalysisPreparedOutput(
            result=SourcePreAnalysisResultInput(
                schema_version=1,
                page_count=1,
            ),
            findings=(),
        )
        finalization = object()

        @contextmanager
        def opened_source():
            try:
                yield source
            finally:
                stream.close()

        source_service.open_for_run.return_value = opened_source()

        def prepare_output(**kwargs):
            self.assertTrue(stream.closed)
            result = kwargs["processor_result"]
            self.assertEqual(result.schema_version, 1)
            self.assertEqual(result.page_count, 1)
            self.assertEqual(result.findings, ())
            return prepared

        output_service.prepare_finalization_inputs.side_effect = prepare_output
        lifecycle.finalize_success.return_value = finalization

        returned = SourcePreAnalysisExecutionService(
            MagicMock(),
            processor_selector=(
                build_source_pre_analysis_processor_selector()
            ),
            lifecycle_service=lifecycle,
            source_service=source_service,
            output_service=output_service,
        ).execute_run(run_id=run_id)

        self.assertIs(returned, finalization)
        lifecycle.start_run.assert_called_once_with(run_id=run_id)
        source_service.open_for_run.assert_called_once_with(run_id=run_id)
        output_service.prepare_finalization_inputs.assert_called_once()
        delegated = lifecycle.finalize_success.call_args.kwargs
        self.assertEqual(delegated["run_id"], run_id)
        self.assertIs(delegated["result"], prepared.result)
        self.assertIs(delegated["findings"], prepared.findings)
        provenance = delegated["provenance"]
        self.assertEqual(provenance.processor_name, IMAGE_PROCESSOR_NAME)
        self.assertEqual(provenance.processor_version, IMAGE_PROCESSOR_VERSION)
        self.assertIsNone(provenance.provider_name)
        self.assertIsNone(provenance.model_name)
        self.assertIsNone(provenance.prompt_version)
        lifecycle.mark_failed.assert_not_called()
        self.assertTrue(stream.closed)


if __name__ == "__main__":
    unittest.main()
