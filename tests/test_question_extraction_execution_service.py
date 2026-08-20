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

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.services.question_extraction_execution_service import (
    INVALID_OUTPUT_FAILURE_MESSAGE,
    OUTPUT_FAILURE_MESSAGE,
    PROCESSOR_FAILURE_MESSAGE,
    SOURCE_FAILURE_MESSAGE,
    UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
    FINALIZATION_FAILURE_MESSAGE,
    QuestionExtractionExecutionFailureTransitionError,
    QuestionExtractionExecutionFinalizationError,
    QuestionExtractionExecutionInvalidOutputError,
    QuestionExtractionExecutionOutputError,
    QuestionExtractionExecutionProcessorError,
    QuestionExtractionExecutionService,
    QuestionExtractionExecutionSourceError,
    QuestionExtractionExecutionStartError,
    QuestionExtractionExecutionUnsupportedSourceError,
    QuestionExtractionExecutionValidationError,
)
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorCandidate,
    QuestionExtractionProcessorExecution,
    QuestionExtractionProcessorProvenance,
    QuestionExtractionProcessorResult,
    QuestionExtractionUnsupportedMimeError,
    ResolvedQuestionExtractionSourceBinary,
)
from app.services.question_extraction_service import (
    QuestionExtractionCandidateInput,
)


class FakeSourceService:
    def __init__(self, source: ResolvedQuestionExtractionSourceBinary) -> None:
        self.source = source
        self.open_calls: list[uuid.UUID] = []

    @contextmanager
    def open_for_run(self, *, run_id: uuid.UUID):
        self.open_calls.append(run_id)
        yield self.source


class QuestionExtractionExecutionServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.run_id = uuid.uuid4()
        self.document_id = uuid.uuid4()
        self.media_id = uuid.uuid4()

        self.source = ResolvedQuestionExtractionSourceBinary(
            source_document_id=self.document_id,
            media_asset_id=self.media_id,
            mime_type="application/pdf",
            original_filename="book.pdf",
            size_bytes=6,
            width_px=None,
            height_px=None,
            stream=MagicMock(),
        )

        self.processor_execution = QuestionExtractionProcessorExecution(
            result=QuestionExtractionProcessorResult(
                schema_version=1,
                candidates=(
                    QuestionExtractionProcessorCandidate(
                        page_number=1,
                        extracted_text=" Find x. ",
                        confidence=Decimal("0.8"),
                    ),
                ),
            ),
            provenance=QuestionExtractionProcessorProvenance(
                processor_name="pdf-question-extraction",
                processor_version="1",
            ),
        )

        self.processor = MagicMock()
        self.processor.process.return_value = self.processor_execution

        self.selector = MagicMock()
        self.selector.select.return_value = self.processor

        self.lifecycle = MagicMock()
        self.lifecycle.start_run.return_value = SimpleNamespace(
            id=self.run_id,
        )
        self.final_candidates = (
            QuestionExtractionCandidateInput(
                source_document_page_id=uuid.uuid4(),
                extracted_text="Find x.",
                confidence=Decimal("0.8"),
            ),
        )
        self.lifecycle.finalize_success.return_value = (
            SimpleNamespace(id=uuid.uuid4()),
        )

        self.source_service = FakeSourceService(self.source)

        self.output_service = MagicMock()
        self.output_service.prepare_finalization_inputs.return_value = (
            self.final_candidates
        )

    def _service(self) -> QuestionExtractionExecutionService:
        return QuestionExtractionExecutionService(
            self.db,
            processor_selector=self.selector,
            lifecycle_service=self.lifecycle,
            source_service=self.source_service,
            output_service=self.output_service,
        )

    def test_constructor_stores_injected_dependencies(self) -> None:
        service = self._service()

        self.assertIs(service.db, self.db)
        self.assertIs(service.processor_selector, self.selector)
        self.assertIs(service.lifecycle_service, self.lifecycle)
        self.assertIs(service.source_service, self.source_service)
        self.assertIs(service.output_service, self.output_service)

    def test_success_path_orchestrates_exact_boundaries(self) -> None:
        returned = self._service().execute_run(run_id=self.run_id)

        self.lifecycle.start_run.assert_called_once_with(
            run_id=self.run_id,
        )
        self.assertEqual(self.source_service.open_calls, [self.run_id])
        self.selector.select.assert_called_once_with(
            mime_type="application/pdf",
        )
        self.processor.process.assert_called_once_with(
            source=self.source,
        )
        self.output_service.prepare_finalization_inputs.assert_called_once()
        output_call = (
            self.output_service.prepare_finalization_inputs.call_args.kwargs
        )
        self.assertEqual(output_call["run_id"], self.run_id)
        self.assertEqual(
            output_call["processor_result"].candidates[0].extracted_text,
            "Find x.",
        )

        self.lifecycle.finalize_success.assert_called_once_with(
            run_id=self.run_id,
            candidates=self.final_candidates,
        )
        self.lifecycle.mark_failed.assert_not_called()
        self.assertIs(
            returned,
            self.lifecycle.finalize_success.return_value,
        )

    def test_invalid_run_id_is_rejected_before_any_dependency_call(self) -> None:
        for run_id in ("bad", 1, True, None):
            with self.subTest(run_id=run_id), self.assertRaises(
                QuestionExtractionExecutionValidationError
            ):
                self._service().execute_run(
                    run_id=run_id,  # type: ignore[arg-type]
                )

        self.lifecycle.start_run.assert_not_called()
        self.selector.select.assert_not_called()
        self.processor.process.assert_not_called()
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.finalize_success.assert_not_called()
        self.lifecycle.mark_failed.assert_not_called()

    def test_start_failure_is_typed_and_does_not_mark_failed(self) -> None:
        failure = RuntimeError("start failed")
        self.lifecycle.start_run.side_effect = failure

        with self.assertRaises(
            QuestionExtractionExecutionStartError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.lifecycle.mark_failed.assert_not_called()
        self.selector.select.assert_not_called()

    def test_source_failure_marks_run_failed_and_raises_typed_error(self) -> None:
        class BrokenSourceService:
            @contextmanager
            def open_for_run(self, *, run_id: uuid.UUID):
                raise RuntimeError("private storage detail")
                yield  # pragma: no cover

        service = QuestionExtractionExecutionService(
            self.db,
            processor_selector=self.selector,
            lifecycle_service=self.lifecycle,
            source_service=BrokenSourceService(),
            output_service=self.output_service,
        )

        with self.assertRaises(
            QuestionExtractionExecutionSourceError
        ) as raised:
            service.execute_run(run_id=self.run_id)

        self.assertEqual(str(raised.exception), SOURCE_FAILURE_MESSAGE)
        self.assertNotIn("private storage detail", str(raised.exception))
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=SOURCE_FAILURE_MESSAGE,
        )

    def test_unsupported_mime_marks_failed_with_public_message(self) -> None:
        self.selector.select.side_effect = (
            QuestionExtractionUnsupportedMimeError("private mime")
        )

        with self.assertRaises(
            QuestionExtractionExecutionUnsupportedSourceError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertEqual(
            str(raised.exception),
            UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
        )
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
        )

    def test_processor_failure_marks_failed_with_public_message(self) -> None:
        self.processor.process.side_effect = RuntimeError(
            "private parser detail"
        )

        with self.assertRaises(
            QuestionExtractionExecutionProcessorError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertEqual(
            str(raised.exception),
            PROCESSOR_FAILURE_MESSAGE,
        )
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=PROCESSOR_FAILURE_MESSAGE,
        )

    def test_invalid_processor_output_marks_failed(self) -> None:
        self.processor.process.return_value = object()

        with self.assertRaises(
            QuestionExtractionExecutionInvalidOutputError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertEqual(
            str(raised.exception),
            INVALID_OUTPUT_FAILURE_MESSAGE,
        )
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=INVALID_OUTPUT_FAILURE_MESSAGE,
        )

    def test_output_mapping_failure_marks_failed(self) -> None:
        self.output_service.prepare_finalization_inputs.side_effect = (
            RuntimeError("private mapping detail")
        )

        with self.assertRaises(
            QuestionExtractionExecutionOutputError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertEqual(
            str(raised.exception),
            OUTPUT_FAILURE_MESSAGE,
        )
        self.lifecycle.finalize_success.assert_not_called()
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=OUTPUT_FAILURE_MESSAGE,
        )

    def test_finalization_failure_attempts_failure_transition(self) -> None:
        failure = RuntimeError("private persistence detail")
        self.lifecycle.finalize_success.side_effect = failure

        with self.assertRaises(
            QuestionExtractionExecutionFinalizationError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertEqual(
            str(raised.exception),
            FINALIZATION_FAILURE_MESSAGE,
        )
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            failure_message=FINALIZATION_FAILURE_MESSAGE,
        )

    def test_failure_transition_failure_preserves_both_errors(self) -> None:
        processor_failure = RuntimeError("processor failed")
        transition_failure = RuntimeError("transition failed")

        self.processor.process.side_effect = processor_failure
        self.lifecycle.mark_failed.side_effect = transition_failure

        with self.assertRaises(
            QuestionExtractionExecutionFailureTransitionError
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIsInstance(
            raised.exception.execution_error,
            QuestionExtractionExecutionProcessorError,
        )
        self.assertIs(
            raised.exception.transition_error,
            transition_failure,
        )
        self.assertIs(raised.exception.__cause__, transition_failure)


if __name__ == "__main__":
    unittest.main()
