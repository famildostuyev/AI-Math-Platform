from __future__ import annotations

import os
import sys
import unittest
import uuid
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


os.environ["DEBUG"] = "false"
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models.source_document_page import SourceDocumentPage
from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisPageReference,
    DocumentAnalysisPageVisual,
    DocumentAnalysisProvenance,
    DocumentAnalysisProviderError,
    DocumentAnalysisProviderAPIError,
    DocumentAnalysisProviderInvalidResponseError,
    DocumentAnalysisProviderNetworkError,
    DocumentAnalysisProviderRateLimitError,
    DocumentAnalysisProviderTimeoutError,
    QuestionAnalysis,
)
from app.services.pdf_raw_document_extractor import (
    PdfRawDocumentValidationError,
)
from app.services.question_extraction_analysis_result_service import (
    QuestionExtractionAnalysisResultError,
)
from app.services.question_extraction_document_analysis_execution_service import (
    DatabaseSourceDocumentPageIdentityResolver,
    QuestionExtractionDocumentAnalysisAlreadyFinalizedError,
    QuestionExtractionDocumentAnalysisExecutionService,
    QuestionExtractionDocumentAnalysisFinalizationError,
    QuestionExtractionDocumentAnalysisInputError,
    QuestionExtractionDocumentAnalysisProviderError as ExecutionProviderError,
    QuestionExtractionDocumentAnalysisProviderAPIError,
    QuestionExtractionDocumentAnalysisProviderNetworkError,
    QuestionExtractionDocumentAnalysisProviderRateLimitError,
    QuestionExtractionDocumentAnalysisProviderResponseError,
    QuestionExtractionDocumentAnalysisProviderTimeoutError,
    QuestionExtractionDocumentAnalysisSourceError,
    QuestionExtractionDocumentAnalysisStartError,
)
from app.services.question_extraction_source_service import (
    QuestionExtractionStoredBinaryNotFoundError,
)
from app.services.raw_document import RawDocument, RawDocumentPage


class _SourceService:
    def __init__(self, source_document_id: uuid.UUID, events: list[str]) -> None:
        self.source_document_id = source_document_id
        self.events = events
        self.run_ids: list[uuid.UUID] = []
        self.error: Exception | None = None

    @contextmanager
    def open_for_run(self, *, run_id: uuid.UUID):
        self.run_ids.append(run_id)
        self.events.append("source-open")
        if self.error is not None:
            raise self.error
        stream = MagicMock()
        try:
            yield SimpleNamespace(
                source_document_id=self.source_document_id,
                stream=stream,
            )
        finally:
            self.events.append("source-closed")


class _PageResolver:
    def __init__(self, pages: tuple[DocumentAnalysisPageReference, ...]) -> None:
        self.pages = pages
        self.source_ids: list[uuid.UUID] = []

    def resolve_for_source(self, *, source_document_id: uuid.UUID):
        self.source_ids.append(source_document_id)
        return self.pages


class _Extractor:
    def __init__(self, raw_document: RawDocument, events: list[str]) -> None:
        self.raw_document = raw_document
        self.events = events
        self.calls: list[dict[str, object]] = []
        self.error: Exception | None = None

    def extract(self, **kwargs):
        self.events.append("extract")
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.raw_document


class _Provider:
    def __init__(self, analysis: DocumentAnalysis, events: list[str]) -> None:
        self.analysis = analysis
        self.events = events
        self.requests: list[object] = []
        self.error: Exception | None = None

    def analyze_document(self, request):
        self.events.append("provider")
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return self.analysis


class QuestionExtractionDocumentAnalysisExecutionServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.run_id = uuid.uuid4()
        self.source_document_id = uuid.uuid4()
        self.page_id = uuid.uuid4()
        self.events: list[str] = []
        self.page_reference = DocumentAnalysisPageReference(
            source_document_page_id=self.page_id,
            page_number=1,
        )
        visual = DocumentAnalysisPageVisual(
            mime_type="image/png",
            content=b"page-image",
        )
        self.raw_document = RawDocument(
            source_document_id=self.source_document_id,
            pages=(
                RawDocumentPage(
                    source_document_page_id=self.page_id,
                    page_number=1,
                    raw_text="2 + 2 = ?",
                    visual_content=visual,
                    extraction_method="pdf_text_layer",
                    extraction_version="1",
                ),
            ),
        )
        self.analysis = DocumentAnalysis(
            schema_version=1,
            detected_language="az",
            questions=(
                QuestionAnalysis(
                    question_number="1",
                    question_text="2 + 2 = ?",
                    source_pages=(self.page_reference,),
                    visual_required=False,
                    confidence=Decimal("1"),
                    needs_review=False,
                ),
            ),
            provenance=DocumentAnalysisProvenance(
                provider_name="test-provider",
                model_name="test-model",
                processor_version="1",
                prompt_version="question-analysis-v1",
                schema_version=1,
            ),
        )
        self.lifecycle = MagicMock()
        self.lifecycle.start_run.side_effect = (
            lambda **kwargs: self.events.append("start")
        )
        self.source = _SourceService(self.source_document_id, self.events)
        self.pages = _PageResolver((self.page_reference,))
        self.extractor = _Extractor(self.raw_document, self.events)
        self.provider = _Provider(self.analysis, self.events)
        self.result_presence = MagicMock()
        self.result_presence.exists_for_run.return_value = False
        self.persisted_result = SimpleNamespace(id=uuid.uuid4())
        self.result_service = MagicMock()
        self.result_service.create_result.side_effect = self._finalize

    def _finalize(self, **kwargs):
        self.events.append("finalize")
        return self.persisted_result

    def _service(self):
        return QuestionExtractionDocumentAnalysisExecutionService(
            lifecycle_service=self.lifecycle,
            source_service=self.source,
            page_identity_resolver=self.pages,
            result_presence_resolver=self.result_presence,
            raw_document_extractor=self.extractor,
            provider=self.provider,
            result_service=self.result_service,
        )

    def test_success_executes_complete_orchestration_once(self) -> None:
        result = self._service().execute_run(run_id=self.run_id)
        self.assertIs(result, self.persisted_result)
        self.lifecycle.start_run.assert_called_once_with(run_id=self.run_id)
        self.assertEqual(self.source.run_ids, [self.run_id])
        self.assertEqual(self.pages.source_ids, [self.source_document_id])
        self.assertEqual(len(self.extractor.calls), 1)
        self.assertEqual(len(self.provider.requests), 1)
        self.result_service.create_result.assert_called_once_with(
            run_id=self.run_id,
            analysis=self.analysis,
        )

    def test_extractor_receives_exact_source_identity_pages_and_stream(self) -> None:
        self._service().execute_run(run_id=self.run_id)
        call = self.extractor.calls[0]
        self.assertEqual(call["source_document_id"], self.source_document_id)
        self.assertEqual(call["source_pages"], (self.page_reference,))
        self.assertIsNotNone(call["stream"])

    def test_request_preserves_text_visual_and_page_identity(self) -> None:
        self._service().execute_run(run_id=self.run_id)
        request = self.provider.requests[0]
        self.assertEqual(request.source_document_id, self.source_document_id)
        self.assertEqual(request.pages[0].source_document_page_id, self.page_id)
        self.assertEqual(request.pages[0].raw_extracted_text, "2 + 2 = ?")
        self.assertEqual(request.pages[0].visual_content.content, b"page-image")

    def test_provider_runs_after_start_and_source_context_closes(self) -> None:
        self._service().execute_run(run_id=self.run_id)
        self.assertEqual(
            self.events,
            ["start", "source-open", "extract", "source-closed", "provider", "finalize"],
        )

    def test_duplicate_result_guard_prevents_all_execution(self) -> None:
        self.result_presence.exists_for_run.return_value = True
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisAlreadyFinalizedError
        ):
            self._service().execute_run(run_id=self.run_id)
        self.lifecycle.start_run.assert_not_called()
        self.assertEqual(self.source.run_ids, [])
        self.assertEqual(self.provider.requests, [])
        self.result_service.create_result.assert_not_called()

    def test_invalid_run_id_is_safe_start_error(self) -> None:
        with self.assertRaises(QuestionExtractionDocumentAnalysisStartError):
            self._service().execute_run(run_id="invalid")  # type: ignore[arg-type]
        self.lifecycle.start_run.assert_not_called()

    def test_result_presence_failure_is_safe_start_error(self) -> None:
        self.result_presence.exists_for_run.side_effect = RuntimeError("db secret")
        with self.assertRaisesRegex(
            QuestionExtractionDocumentAnalysisStartError,
            "could not be checked",
        ):
            self._service().execute_run(run_id=self.run_id)
        self.lifecycle.start_run.assert_not_called()

    def test_start_failure_stops_before_source_and_provider(self) -> None:
        self.lifecycle.start_run.side_effect = RuntimeError("db secret")
        with self.assertRaises(QuestionExtractionDocumentAnalysisStartError):
            self._service().execute_run(run_id=self.run_id)
        self.assertEqual(self.source.run_ids, [])
        self.assertEqual(self.provider.requests, [])

    def test_source_failure_maps_to_safe_error(self) -> None:
        self.source.error = QuestionExtractionStoredBinaryNotFoundError("path")
        with self.assertRaisesRegex(
            QuestionExtractionDocumentAnalysisSourceError,
            "source is unavailable",
        ):
            self._service().execute_run(run_id=self.run_id)
        self.assertEqual(self.provider.requests, [])

    def test_empty_active_page_set_is_rejected(self) -> None:
        self.pages.pages = ()
        with self.assertRaises(QuestionExtractionDocumentAnalysisInputError):
            self._service().execute_run(run_id=self.run_id)
        self.assertEqual(self.extractor.calls, [])
        self.assertEqual(self.provider.requests, [])

    def test_page_count_or_identity_mismatch_is_safe_input_error(self) -> None:
        self.extractor.error = PdfRawDocumentValidationError("physical mismatch")
        with self.assertRaisesRegex(
            QuestionExtractionDocumentAnalysisInputError,
            "input could not be prepared",
        ):
            self._service().execute_run(run_id=self.run_id)
        self.assertEqual(self.provider.requests, [])
        self.result_service.create_result.assert_not_called()

    def test_provider_timeout_is_mapped(self) -> None:
        self.provider.error = DocumentAnalysisProviderTimeoutError("sdk timeout")
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisProviderTimeoutError
        ):
            self._service().execute_run(run_id=self.run_id)
        self.result_service.create_result.assert_not_called()

    def test_provider_rate_limit_is_mapped(self) -> None:
        self.provider.error = DocumentAnalysisProviderRateLimitError("sdk response")
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisProviderRateLimitError
        ):
            self._service().execute_run(run_id=self.run_id)

    def test_invalid_provider_response_is_mapped(self) -> None:
        self.provider.error = DocumentAnalysisProviderInvalidResponseError("raw")
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisProviderResponseError
        ):
            self._service().execute_run(run_id=self.run_id)

    def test_declared_generic_provider_error_is_mapped(self) -> None:
        self.provider.error = DocumentAnalysisProviderError("provider secret")
        with self.assertRaises(ExecutionProviderError):
            self._service().execute_run(run_id=self.run_id)

    def test_unexpected_provider_error_is_mapped(self) -> None:
        self.provider.error = RuntimeError("provider secret")
        with self.assertRaisesRegex(
            ExecutionProviderError,
            "provider request failed",
        ):
            self._service().execute_run(run_id=self.run_id)

    def test_api_and_network_provider_categories_are_preserved(self) -> None:
        cases = (
            (
                DocumentAnalysisProviderAPIError("secret"),
                QuestionExtractionDocumentAnalysisProviderAPIError,
                "provider_api_error",
            ),
            (
                DocumentAnalysisProviderNetworkError("secret"),
                QuestionExtractionDocumentAnalysisProviderNetworkError,
                "provider_network_error",
            ),
        )
        for error, expected_type, category in cases:
            with self.subTest(category=category):
                self.provider.error = error
                with self.assertRaises(expected_type) as captured:
                    self._service().execute_run(run_id=self.run_id)
                self.assertEqual(captured.exception.safe_category, category)
                self.provider.error = None

    def test_finalization_error_has_safe_category(self) -> None:
        self.result_service.create_result.side_effect = RuntimeError("db secret")
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisFinalizationError
        ) as captured:
            self._service().execute_run(run_id=self.run_id)
        self.assertEqual(captured.exception.safe_category, "finalization_error")

    def test_finalization_failure_is_mapped_and_not_retried(self) -> None:
        self.result_service.create_result.side_effect = (
            QuestionExtractionAnalysisResultError("persistence")
        )
        with self.assertRaises(
            QuestionExtractionDocumentAnalysisFinalizationError
        ):
            self._service().execute_run(run_id=self.run_id)
        self.result_service.create_result.assert_called_once()

    def test_unexpected_finalization_failure_is_mapped(self) -> None:
        self.result_service.create_result.side_effect = RuntimeError("db secret")
        with self.assertRaisesRegex(
            QuestionExtractionDocumentAnalysisFinalizationError,
            "could not be finalized",
        ):
            self._service().execute_run(run_id=self.run_id)

    def test_page_resolver_uses_active_deterministic_page_query(self) -> None:
        db = MagicMock()
        page_two = SimpleNamespace(id=uuid.uuid4(), page_number=2)
        db.scalars.return_value.all.return_value = [
            SimpleNamespace(id=self.page_id, page_number=1),
            page_two,
        ]
        result = DatabaseSourceDocumentPageIdentityResolver(db).resolve_for_source(
            source_document_id=self.source_document_id,
        )
        statement = db.scalars.call_args.args[0]
        sql = str(statement)
        self.assertIn("source_document_pages.source_document_id", sql)
        self.assertIn("source_document_pages.deleted_at IS NULL", sql)
        self.assertIn("ORDER BY source_document_pages.page_number ASC", sql)
        self.assertNotIn("FOR UPDATE", sql)
        self.assertEqual(tuple(page.page_number for page in result), (1, 2))

    def test_service_has_no_candidate_or_openai_provider_construction(self) -> None:
        service_path = (
            BACKEND_DIR
            / "app/services/question_extraction_document_analysis_execution_service.py"
        )
        source = service_path.read_text(encoding="utf-8")
        self.assertNotIn("QuestionCandidate", source)
        self.assertNotIn("OpenAIDocumentAnalysisProvider", source)
        self.assertNotIn("api_key", source)

    def test_orchestrator_does_not_finalize_lifecycle_directly(self) -> None:
        self._service().execute_run(run_id=self.run_id)
        self.assertEqual(
            self.lifecycle.method_calls,
            [unittest.mock.call.start_run(run_id=self.run_id)],
        )


if __name__ == "__main__":
    unittest.main()
