from __future__ import annotations

import sys
import unittest
import uuid
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
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

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.source_pre_analysis_execution_service import (
    FINALIZATION_FAILURE_MESSAGE,
    INVALID_OUTPUT_FAILURE_MESSAGE,
    OUTPUT_FAILURE_MESSAGE,
    PROCESSOR_FAILURE_MESSAGE,
    SOURCE_FAILURE_MESSAGE,
    UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
    SourcePreAnalysisExecutionFailureTransitionError,
    SourcePreAnalysisExecutionFinalizationError,
    SourcePreAnalysisExecutionInvalidOutputError,
    SourcePreAnalysisExecutionOutputError,
    SourcePreAnalysisExecutionProcessorError,
    SourcePreAnalysisExecutionReconciliationRequiredError,
    SourcePreAnalysisExecutionService,
    SourcePreAnalysisExecutionSourceError,
    SourcePreAnalysisExecutionStartError,
    SourcePreAnalysisExecutionUnsupportedSourceError,
    SourcePreAnalysisExecutionValidationError,
)
from app.services.source_pre_analysis_output_service import (
    SourcePreAnalysisFindingPageError,
    SourcePreAnalysisOutputSourceNotFoundError,
    SourcePreAnalysisPageCountError,
    SourcePreAnalysisPagePersistenceConflictError,
    SourcePreAnalysisPageStructureError,
    SourcePreAnalysisPreparedOutput,
)
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    SourcePreAnalysisProcessorFinding,
    SourcePreAnalysisProcessorProvenance,
    SourcePreAnalysisProcessorResult,
    SourcePreAnalysisUnsupportedMimeError,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisFindingInput,
    SourcePreAnalysisInvalidRunStateError,
    SourcePreAnalysisPersistenceConflictError,
    SourcePreAnalysisResultAlreadyExistsError,
    SourcePreAnalysisResultInput,
    SourcePreAnalysisRunClaim,
    SourcePreAnalysisRunNotFoundError,
)
from app.services.source_pre_analysis_source_service import (
    SourcePreAnalysisSourceMetadataError,
    SourcePreAnalysisSourceMetadataNotFoundError,
    SourcePreAnalysisSourceResolutionError,
    SourcePreAnalysisStoredBinaryNotFoundError,
)


class SourcePreAnalysisExecutionServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.run_id = uuid.uuid4()
        self.lease_id = uuid.uuid4()
        claim_time = datetime(2026, 8, 19, 10, 0, tzinfo=timezone.utc)
        self.claim = SourcePreAnalysisRunClaim(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            started_at=claim_time,
            last_heartbeat_at=claim_time,
        )
        self.lifecycle = MagicMock()
        self.source_service = MagicMock()
        self.selector = MagicMock()
        self.processor = MagicMock()
        self.output_service = MagicMock()
        self.source = ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type="application/pdf",
            original_filename="source.pdf",
            size_bytes=12,
            width_px=None,
            height_px=None,
            stream=BytesIO(b"source bytes"),
        )
        self.execution = SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=1,
                findings=(
                    SourcePreAnalysisProcessorFinding(
                        page_number=1,
                        finding_code="question_candidate",
                        severity=SourcePreAnalysisFindingSeverity.INFO,
                        confidence=Decimal("0.9000"),
                        message="Candidate detected.",
                    ),
                ),
            ),
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name="pdf-pre-analysis",
                processor_version="1",
                provider_name="provider",
                model_name="model",
                prompt_version="prompt-v1",
            ),
        )
        self.prepared = SourcePreAnalysisPreparedOutput(
            result=SourcePreAnalysisResultInput(
                schema_version=1,
                page_count=1,
            ),
            findings=(
                SourcePreAnalysisFindingInput(
                    source_document_page_id=uuid.uuid4(),
                    finding_code="question_candidate",
                    severity=SourcePreAnalysisFindingSeverity.INFO,
                    confidence=Decimal("0.9000"),
                    message="Candidate detected.",
                ),
            ),
        )
        self.finalization = object()
        self.selector.select.return_value = self.processor
        self.processor.process.return_value = self.execution
        self.output_service.prepare_finalization_inputs.return_value = (
            self.prepared
        )
        self.lifecycle.finalize_success.return_value = self.finalization
        self.lifecycle.start_run.return_value = self.claim
        self._set_source_context()

    def _set_source_context(
        self,
        *,
        source: ResolvedSourceBinary | None = None,
        events: list[str] | None = None,
        enter_error: Exception | None = None,
        exit_error: Exception | None = None,
    ) -> None:
        selected_source = source or self.source

        @contextmanager
        def opened_source():
            if enter_error is not None:
                raise enter_error
            if events is not None:
                events.append("source_enter")
            try:
                yield selected_source
            finally:
                if events is not None:
                    events.append("source_exit")
                if exit_error is not None:
                    raise exit_error

        self.source_service.open_for_run.return_value = opened_source()

    def _service(self) -> SourcePreAnalysisExecutionService:
        return SourcePreAnalysisExecutionService(
            self.db,
            processor_selector=self.selector,
            lifecycle_service=self.lifecycle,
            source_service=self.source_service,
            output_service=self.output_service,
        )

    def _assert_no_post_start_work(self) -> None:
        self.source_service.open_for_run.assert_not_called()
        self.selector.select.assert_not_called()
        self.processor.process.assert_not_called()
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.finalize_success.assert_not_called()
        self.lifecycle.mark_failed.assert_not_called()

    def test_success_has_exact_order_delegation_and_return_identity(self) -> None:
        events: list[str] = []
        self.lifecycle.start_run.side_effect = lambda **_: (
            events.append("start") or self.claim
        )
        self._set_source_context(events=events)
        self.selector.select.side_effect = lambda **_: (
            events.append("select") or self.processor
        )
        self.processor.process.side_effect = lambda **_: (
            events.append("process") or self.execution
        )
        self.output_service.prepare_finalization_inputs.side_effect = (
            lambda **_: events.append("output") or self.prepared
        )
        self.lifecycle.finalize_success.side_effect = (
            lambda **_: events.append("finalize") or self.finalization
        )

        returned = self._service().execute_run(run_id=self.run_id)

        self.assertIs(returned, self.finalization)
        self.assertEqual(
            events,
            ["start", "source_enter", "select", "process", "source_exit",
             "output", "finalize"],
        )
        self.lifecycle.start_run.assert_called_once_with(run_id=self.run_id)
        self.source_service.open_for_run.assert_called_once_with(
            run_id=self.run_id,
        )
        self.selector.select.assert_called_once_with(
            mime_type="application/pdf",
        )
        self.processor.process.assert_called_once_with(source=self.source)
        self.output_service.prepare_finalization_inputs.assert_called_once_with(
            run_id=self.run_id,
            processor_result=self.execution.result,
        )
        self.lifecycle.finalize_success.assert_called_once_with(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            result=self.prepared.result,
            findings=self.prepared.findings,
            provenance=self.execution.provenance,
        )
        self.lifecycle.mark_failed.assert_not_called()

    def test_validation_normalizes_after_source_context_exits(self) -> None:
        events: list[str] = []
        self._set_source_context(events=events)
        unnormalized = SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=1,
                findings=(SourcePreAnalysisProcessorFinding(
                    page_number=1,
                    finding_code=" code ",
                    severity=SourcePreAnalysisFindingSeverity.INFO,
                    confidence=None,
                    message=" message ",
                ),),
            ),
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name=" pdf-processor ",
                processor_version=" 1 ",
            ),
        )
        self.processor.process.return_value = unnormalized
        self.output_service.prepare_finalization_inputs.side_effect = (
            lambda **kwargs: (
                self.assertEqual(events, ["source_enter", "source_exit"])
                or self.assertEqual(
                    kwargs["processor_result"].findings[0].finding_code,
                    "code",
                )
                or self.prepared
            )
        )

        self._service().execute_run(run_id=self.run_id)

        delegated = self.lifecycle.finalize_success.call_args.kwargs
        self.assertEqual(delegated["provenance"].processor_name, "pdf-processor")
        self.assertEqual(delegated["provenance"].processor_version, "1")

    def test_invalid_run_id_rejects_before_all_collaborators(self) -> None:
        for invalid in (str(self.run_id), None, 1, True):
            with self.subTest(invalid=invalid):
                with self.assertRaises(
                    SourcePreAnalysisExecutionValidationError,
                ):
                    self._service().execute_run(run_id=invalid)  # type: ignore[arg-type]
                self.lifecycle.start_run.assert_not_called()
                self._assert_no_post_start_work()

    def test_every_start_failure_stops_without_marking_failed(self) -> None:
        failures = (
            SourcePreAnalysisRunNotFoundError("missing"),
            SourcePreAnalysisInvalidRunStateError("running"),
            SourcePreAnalysisInvalidRunStateError("succeeded"),
            SourcePreAnalysisInvalidRunStateError("failed"),
            SourcePreAnalysisPersistenceConflictError("conflict"),
            RuntimeError("unexpected"),
        )
        for failure in failures:
            with self.subTest(failure=repr(failure)):
                self.lifecycle.reset_mock()
                self.lifecycle.start_run.side_effect = failure
                with self.assertRaises(
                    SourcePreAnalysisExecutionStartError,
                ) as raised:
                    self._service().execute_run(run_id=self.run_id)
                self.assertIs(raised.exception.__cause__, failure)
                self.lifecycle.start_run.assert_called_once_with(
                    run_id=self.run_id,
                )
                self._assert_no_post_start_work()

    def test_source_failures_are_sanitized_and_stop_processing(self) -> None:
        failures = (
            SourcePreAnalysisSourceMetadataNotFoundError("secret metadata"),
            SourcePreAnalysisStoredBinaryNotFoundError("C:\\secret\\file"),
            SourcePreAnalysisSourceMetadataError("storage-key"),
            SourcePreAnalysisSourceResolutionError("database detail"),
        )
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.lifecycle.reset_mock()
                self.source_service.reset_mock()
                self._set_source_context(enter_error=failure)
                with self.assertRaises(
                    SourcePreAnalysisExecutionSourceError,
                ) as raised:
                    self._service().execute_run(run_id=self.run_id)
                self.assertIs(raised.exception.__cause__, failure)
                self.lifecycle.mark_failed.assert_called_once_with(
                    run_id=self.run_id,
                    execution_lease_id=self.lease_id,
                    failure_message=SOURCE_FAILURE_MESSAGE,
                )
                self.selector.select.assert_not_called()
                self.processor.process.assert_not_called()
                self.output_service.prepare_finalization_inputs.assert_not_called()
                self.lifecycle.finalize_success.assert_not_called()

    def test_unsupported_mime_closes_context_and_marks_failed(self) -> None:
        events: list[str] = []
        self._set_source_context(events=events)
        failure = SourcePreAnalysisUnsupportedMimeError("unsupported secret")
        self.selector.select.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisExecutionUnsupportedSourceError,
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.assertEqual(events, ["source_enter", "source_exit"])
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            failure_message=UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
        )
        self.processor.process.assert_not_called()
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.finalize_success.assert_not_called()

    def test_selector_internal_failure_uses_processing_category(self) -> None:
        failure = RuntimeError("registry internals")
        self.selector.select.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisExecutionProcessorError,
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            failure_message=PROCESSOR_FAILURE_MESSAGE,
        )
        self.processor.process.assert_not_called()

    def test_processor_failure_closes_context_and_never_leaks_message(self) -> None:
        events: list[str] = []
        self._set_source_context(events=events)
        failure = RuntimeError("secret /path payload")
        self.processor.process.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisExecutionProcessorError,
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.processor.process.assert_called_once_with(source=self.source)
        self.assertEqual(events, ["source_enter", "source_exit"])
        mark_call = self.lifecycle.mark_failed.call_args.kwargs
        self.assertEqual(mark_call["failure_message"], PROCESSOR_FAILURE_MESSAGE)
        self.assertNotIn("secret", mark_call["failure_message"])
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.finalize_success.assert_not_called()

    def test_invalid_execution_variants_mark_failed_before_output(self) -> None:
        invalid_finding = SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=1,
                findings=(SimpleNamespace(),),  # type: ignore[arg-type]
            ),
            provenance=self.execution.provenance,
        )
        invalid_provenance = SourcePreAnalysisProcessorExecution(
            result=self.execution.result,
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name="INVALID NAME",
                processor_version="1",
            ),
        )
        invalid_result = SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=0,
                page_count=1,
                findings=(),
            ),
            provenance=self.execution.provenance,
        )
        for invalid in (object(), invalid_result, invalid_finding,
                        invalid_provenance):
            with self.subTest(invalid=type(invalid).__name__):
                self.lifecycle.reset_mock()
                self.processor.process.return_value = invalid
                self._set_source_context()
                with self.assertRaises(
                    SourcePreAnalysisExecutionInvalidOutputError,
                ) as raised:
                    self._service().execute_run(run_id=self.run_id)
                self.assertIsNotNone(raised.exception.__cause__)
                self.lifecycle.mark_failed.assert_called_once_with(
                    run_id=self.run_id,
                    execution_lease_id=self.lease_id,
                    failure_message=INVALID_OUTPUT_FAILURE_MESSAGE,
                )
                self.output_service.prepare_finalization_inputs.assert_not_called()
                self.lifecycle.finalize_success.assert_not_called()

    def test_output_failure_variants_are_sanitized_and_not_finalized(self) -> None:
        failures = (
            SourcePreAnalysisPageCountError("count detail"),
            SourcePreAnalysisFindingPageError("page detail"),
            SourcePreAnalysisPageStructureError("structure detail"),
            SourcePreAnalysisOutputSourceNotFoundError("source detail"),
            SourcePreAnalysisPagePersistenceConflictError("database detail"),
        )
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.lifecycle.reset_mock()
                self.output_service.reset_mock()
                self.output_service.prepare_finalization_inputs.side_effect = failure
                self._set_source_context()
                with self.assertRaises(
                    SourcePreAnalysisExecutionOutputError,
                ) as raised:
                    self._service().execute_run(run_id=self.run_id)
                self.assertIs(raised.exception.__cause__, failure)
                self.lifecycle.mark_failed.assert_called_once_with(
                    run_id=self.run_id,
                    execution_lease_id=self.lease_id,
                    failure_message=OUTPUT_FAILURE_MESSAGE,
                )
                self.lifecycle.finalize_success.assert_not_called()

    def test_finalization_failure_marks_failed_without_retry_or_compensation(
        self,
    ) -> None:
        failure = SourcePreAnalysisPersistenceConflictError("database detail")
        self.lifecycle.finalize_success.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisExecutionFinalizationError,
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.lifecycle.finalize_success.assert_called_once()
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            failure_message=FINALIZATION_FAILURE_MESSAGE,
        )
        self.assertEqual(self.output_service.method_calls.count(
            unittest.mock.call.prepare_finalization_inputs(
                run_id=self.run_id,
                processor_result=self.execution.result,
            )
        ), 1)

    def test_processing_and_failure_transition_errors_are_both_retained(
        self,
    ) -> None:
        processing_error = RuntimeError("processor detail")
        transition_error = SourcePreAnalysisPersistenceConflictError(
            "transition detail"
        )
        self.processor.process.side_effect = processing_error
        self.lifecycle.mark_failed.side_effect = transition_error

        with self.assertRaises(
            SourcePreAnalysisExecutionFailureTransitionError,
        ) as raised:
            self._service().execute_run(run_id=self.run_id)

        compound = raised.exception
        self.assertIs(compound.transition_error, transition_error)
        self.assertIs(compound.__cause__, transition_error)
        self.assertIsInstance(
            compound.execution_error,
            SourcePreAnalysisExecutionProcessorError,
        )
        self.assertIs(compound.execution_error.__cause__, processing_error)

    def test_finalization_terminal_state_requires_reconciliation(self) -> None:
        for transition_error in (
            SourcePreAnalysisInvalidRunStateError("already succeeded"),
            SourcePreAnalysisResultAlreadyExistsError("result exists"),
        ):
            with self.subTest(transition=type(transition_error).__name__):
                self.lifecycle.reset_mock()
                finalization_failure = RuntimeError("ambiguous commit")
                self.lifecycle.finalize_success.side_effect = finalization_failure
                self.lifecycle.mark_failed.side_effect = transition_error
                self._set_source_context()

                with self.assertRaises(
                    SourcePreAnalysisExecutionReconciliationRequiredError,
                ) as raised:
                    self._service().execute_run(run_id=self.run_id)

                reconciliation = raised.exception
                self.assertIs(reconciliation.transition_error, transition_error)
                self.assertIs(reconciliation.__cause__, transition_error)
                self.assertIs(
                    reconciliation.finalization_error.__cause__,
                    finalization_failure,
                )
                self.lifecycle.finalize_success.assert_called_once()
                self.lifecycle.mark_failed.assert_called_once_with(
                    run_id=self.run_id,
                    execution_lease_id=self.lease_id,
                    failure_message=FINALIZATION_FAILURE_MESSAGE,
                )

    def test_nonfinal_transition_state_error_is_compound_not_reconciliation(
        self,
    ) -> None:
        processing_error = RuntimeError("processor failed")
        transition_error = SourcePreAnalysisInvalidRunStateError("changed")
        self.processor.process.side_effect = processing_error
        self.lifecycle.mark_failed.side_effect = transition_error

        with self.assertRaises(
            SourcePreAnalysisExecutionFailureTransitionError,
        ):
            self._service().execute_run(run_id=self.run_id)

    def test_context_exit_failure_is_source_failure(self) -> None:
        failure = RuntimeError("stream close detail")
        self._set_source_context(exit_error=failure)

        with self.assertRaises(SourcePreAnalysisExecutionSourceError) as raised:
            self._service().execute_run(run_id=self.run_id)

        self.assertIs(raised.exception.__cause__, failure)
        self.lifecycle.mark_failed.assert_called_once_with(
            run_id=self.run_id,
            execution_lease_id=self.lease_id,
            failure_message=SOURCE_FAILURE_MESSAGE,
        )
        self.output_service.prepare_finalization_inputs.assert_not_called()
        self.lifecycle.finalize_success.assert_not_called()


if __name__ == "__main__":
    unittest.main()
