from __future__ import annotations

import os
import sys
import unittest
import uuid
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest.mock import MagicMock, call, patch


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import Settings
from app.services.question_extraction_execution_service import (
    QuestionExtractionExecutionError,
    QuestionExtractionExecutionProcessorError,
    QuestionExtractionExecutionStartError,
)
from app.services.question_extraction_document_analysis_execution_service import (
    QuestionExtractionDocumentAnalysisAlreadyFinalizedError,
    QuestionExtractionDocumentAnalysisExecutionService,
    QuestionExtractionDocumentAnalysisProviderTimeoutError,
)
from app.services.question_extraction_execution_strategy import (
    build_question_extraction_execution_strategy,
)
from app.services.question_extraction_worker_service import (
    QuestionExtractionWorkerService,
    QuestionExtractionWorkerSummary,
)


class QuestionExtractionWorkerServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.sessions: list[MagicMock] = []

        def session_factory() -> MagicMock:
            session = MagicMock(name=f"session-{len(self.sessions)}")
            self.sessions.append(session)
            return session

        self.session_factory = session_factory

    def _run(
        self,
        *,
        pending_ids=(),
        execution_effects=(),
        worker_batch_size: int = 7,
    ):
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = tuple(pending_ids)

        executions = []

        def execution_factory(*args, **kwargs):
            execution = MagicMock()
            index = len(executions)
            if index < len(execution_effects):
                execution.execute_run.side_effect = execution_effects[index]
            executions.append(execution)
            return execution

        selector_factory = MagicMock(side_effect=lambda: object())

        with (
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionDispatchService",
                return_value=dispatch,
            ) as dispatch_class,
        ):
            summary = QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                worker_batch_size=worker_batch_size,
                selector_factory=selector_factory,
                execution_strategy_factory=execution_factory,
            ).run_once()

        return (
            summary,
            dispatch,
            executions,
            selector_factory,
            dispatch_class,
        )

    def test_zero_work_is_bounded_and_closes_discovery_session(self) -> None:
        summary, dispatch = self._run()[:2]

        dispatch.list_pending_run_ids.assert_called_once_with(limit=7)
        self.assertEqual(
            summary,
            QuestionExtractionWorkerSummary(
                discovered=0,
                succeeded=0,
                failed=0,
                start_skipped=0,
            ),
        )
        self.assertEqual(len(self.sessions), 1)
        self.sessions[0].close.assert_called_once_with()

    def test_explicit_run_id_executes_only_that_target_without_queue_fallback(
        self,
    ) -> None:
        target_run_id = uuid.uuid4()
        other_run_id = uuid.uuid4()
        strategy = MagicMock()
        strategy_factory = MagicMock(return_value=strategy)

        discovery_session = MagicMock()
        discovery_session.scalar.return_value = target_run_id
        execution_session = MagicMock()
        sessions = iter((discovery_session, execution_session))

        with patch(
            "app.services.question_extraction_worker_service."
            "QuestionExtractionDispatchService"
        ) as dispatch_class:
            summary = QuestionExtractionWorkerService(
                session_factory=lambda: next(sessions),
                execution_strategy_factory=strategy_factory,
            ).run_once(run_id=target_run_id)

        self.assertEqual(summary.discovered, 1)
        strategy.execute_run.assert_called_once_with(run_id=target_run_id)
        self.assertNotEqual(
            strategy.execute_run.call_args,
            call(run_id=other_run_id),
        )
        dispatch_class.assert_not_called()
        discovery_session.close.assert_called_once_with()
        execution_session.close.assert_called_once_with()

    def test_ineligible_explicit_target_does_not_execute_or_fallback(self) -> None:
        for reason in ("non_pending", "deleted", "existing_result"):
            with self.subTest(reason=reason):
                target_run_id = uuid.uuid4()
                discovery_session = MagicMock()
                discovery_session.scalar.return_value = None
                strategy_factory = MagicMock()
                with patch(
                    "app.services.question_extraction_worker_service."
                    "QuestionExtractionDispatchService"
                ) as dispatch_class:
                    summary = QuestionExtractionWorkerService(
                        session_factory=lambda: discovery_session,
                        execution_strategy_factory=strategy_factory,
                    ).run_once(run_id=target_run_id)
                self.assertEqual(summary.discovered, 0)
                strategy_factory.assert_not_called()
                dispatch_class.assert_not_called()

    def test_explicit_target_query_enforces_pending_active_and_no_result(self) -> None:
        target_run_id = uuid.uuid4()
        discovery_session = MagicMock()
        discovery_session.scalar.return_value = None
        QuestionExtractionWorkerService(
            session_factory=lambda: discovery_session,
            execution_strategy_factory=MagicMock(),
        ).run_once(run_id=target_run_id)

        statement = discovery_session.scalar.call_args.args[0]
        sql = str(statement)
        self.assertIn("question_extraction_runs.id", sql)
        self.assertIn("question_extraction_runs.status", sql)
        self.assertIn("question_extraction_runs.deleted_at IS NULL", sql)
        self.assertIn("source_documents.deleted_at IS NULL", sql)
        self.assertIn("NOT (EXISTS", sql)
        self.assertIn("question_extraction_results", sql)

    def test_invalid_explicit_run_id_is_rejected_before_discovery(self) -> None:
        with self.assertRaises(ValueError):
            QuestionExtractionWorkerService(
                session_factory=self.session_factory,
            ).run_once(run_id="invalid")  # type: ignore[arg-type]
        self.assertEqual(self.sessions, [])

    def test_discovery_session_closes_before_run_sessions_open(self) -> None:
        run_id = uuid.uuid4()
        events = []
        sessions = []

        def factory():
            session = MagicMock()
            index = len(sessions)
            sessions.append(session)
            events.append(f"open-{index}")
            session.close.side_effect = lambda: events.append(
                f"close-{index}"
            )
            return session

        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)

        with (
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionDispatchService",
                return_value=dispatch,
            ),
        ):
            execution_class = MagicMock()
            QuestionExtractionWorkerService(
                session_factory=factory,
                selector_factory=lambda: object(),
                execution_strategy_factory=execution_class,
            ).run_once()

        self.assertLess(
            events.index("close-0"),
            events.index("open-1"),
        )
        execution_class.return_value.execute_run.assert_called_once_with(
            run_id=run_id
        )

    def test_default_execution_mode_is_legacy(self) -> None:
        run_id = uuid.uuid4()
        strategy_factory = MagicMock()
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)
        with patch(
            "app.services.question_extraction_worker_service."
            "QuestionExtractionDispatchService",
            return_value=dispatch,
        ):
            QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                execution_strategy_factory=strategy_factory,
            ).run_once()
        self.assertEqual(
            strategy_factory.call_args.kwargs["execution_mode"],
            "legacy",
        )

    def test_document_analysis_mode_delegates_to_injected_strategy(self) -> None:
        run_id = uuid.uuid4()
        strategy = MagicMock()
        strategy_factory = MagicMock(return_value=strategy)
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)
        with patch(
            "app.services.question_extraction_worker_service."
            "QuestionExtractionDispatchService",
            return_value=dispatch,
        ):
            summary = QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                execution_mode="document_analysis",
                execution_strategy_factory=strategy_factory,
            ).run_once()
        self.assertEqual(summary.succeeded, 1)
        self.assertEqual(
            strategy_factory.call_args.kwargs["execution_mode"],
            "document_analysis",
        )
        strategy.execute_run.assert_called_once_with(run_id=run_id)

    def test_document_analysis_failure_uses_safe_failure_transition(self) -> None:
        run_id = uuid.uuid4()
        strategy = MagicMock()
        strategy.execute_run.side_effect = (
            QuestionExtractionDocumentAnalysisProviderTimeoutError("secret")
        )
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)
        with (
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionDispatchService",
                return_value=dispatch,
            ),
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionService"
            ) as lifecycle_class,
        ):
            with self.assertLogs(
                "app.services.question_extraction_worker_service",
                level="WARNING",
            ) as captured:
                summary = QuestionExtractionWorkerService(
                    session_factory=self.session_factory,
                    execution_mode="document_analysis",
                    execution_strategy_factory=MagicMock(return_value=strategy),
                ).run_once()
        self.assertEqual(summary.failed, 1)
        lifecycle_class.return_value.mark_failed.assert_called_once_with(
            run_id=run_id,
            failure_message="Document analysis execution failed.",
        )
        log_output = " ".join(captured.output)
        self.assertIn("category=timeout", log_output)
        self.assertNotIn("secret", log_output)
        self.assertNotIn("api_key", log_output)
        self.assertNotIn("request body", log_output)
        self.assertNotIn("response body", log_output)
        self.assertNotIn("source text", log_output)

    def test_existing_document_analysis_result_is_start_skipped(self) -> None:
        run_id = uuid.uuid4()
        strategy = MagicMock()
        strategy.execute_run.side_effect = (
            QuestionExtractionDocumentAnalysisAlreadyFinalizedError("exists")
        )
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)
        with patch(
            "app.services.question_extraction_worker_service."
            "QuestionExtractionDispatchService",
            return_value=dispatch,
        ):
            summary = QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                execution_mode="document_analysis",
                execution_strategy_factory=MagicMock(return_value=strategy),
            ).run_once()
        self.assertEqual(summary.start_skipped, 1)

    def test_invalid_execution_mode_fails_fast(self) -> None:
        with self.assertRaises(ValueError):
            QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                execution_mode="invalid",  # type: ignore[arg-type]
            )

    def test_legacy_composition_uses_selector_and_not_provider(self) -> None:
        db = MagicMock()
        selector = MagicMock()
        selector_factory = MagicMock(return_value=selector)
        provider_factory = MagicMock()
        with patch(
            "app.services.question_extraction_execution_strategy."
            "QuestionExtractionExecutionService"
        ) as legacy_class:
            result = build_question_extraction_execution_strategy(
                db,
                execution_mode="legacy",
                selector_factory=selector_factory,
                document_analysis_provider_factory=provider_factory,
            )
        self.assertIs(result, legacy_class.return_value)
        selector_factory.assert_called_once_with()
        legacy_class.assert_called_once_with(db, processor_selector=selector)
        provider_factory.assert_not_called()

    def test_document_analysis_composition_uses_injected_provider(self) -> None:
        db = MagicMock()
        provider = MagicMock(name="fake-provider")
        provider_factory = MagicMock(return_value=provider)
        selector_factory = MagicMock()
        strategy = build_question_extraction_execution_strategy(
            db,
            execution_mode="document_analysis",
            selector_factory=selector_factory,
            document_analysis_provider_factory=provider_factory,
        )
        self.assertIsInstance(
            strategy,
            QuestionExtractionDocumentAnalysisExecutionService,
        )
        self.assertIs(strategy.provider, provider)
        provider_factory.assert_called_once_with()
        selector_factory.assert_not_called()

    def test_worker_does_not_construct_openai_or_finalize_success(self) -> None:
        module = Path(
            BACKEND_DIR
            / "app/services/question_extraction_worker_service.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("OpenAIDocumentAnalysisProvider", module)
        self.assertNotIn("finalize_success", module)
        self.assertNotIn("QuestionCandidate", module)

    def test_each_run_gets_new_session_selector_and_one_attempt(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))

        result = self._run(pending_ids=ids)
        summary, _, executions, selector_factory = result[:4]

        self.assertEqual(summary.discovered, 3)
        self.assertEqual(summary.succeeded, 3)
        self.assertEqual(summary.failed, 0)
        self.assertEqual(summary.start_skipped, 0)

        self.assertEqual(len(self.sessions), 4)
        self.assertEqual(selector_factory.call_count, 0)
        self.assertEqual(
            [execution.execute_run.call_args for execution in executions],
            [call(run_id=run_id) for run_id in ids],
        )

        for session in self.sessions:
            session.close.assert_called_once_with()

    def test_start_failures_are_skipped_and_later_runs_continue(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))

        summary = self._run(
            pending_ids=ids,
            execution_effects=(
                QuestionExtractionExecutionStartError("claimed"),
                None,
                None,
            ),
        )[0]

        self.assertEqual(
            summary,
            QuestionExtractionWorkerSummary(
                discovered=3,
                succeeded=2,
                failed=0,
                start_skipped=1,
            ),
        )

        self.sessions[1].rollback.assert_called_once_with()
        self.sessions[2].rollback.assert_not_called()
        self.sessions[3].rollback.assert_not_called()

    def test_execution_failures_are_counted_and_do_not_stop_batch(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))

        summary = self._run(
            pending_ids=ids,
            execution_effects=(
                QuestionExtractionExecutionProcessorError("failed"),
                None,
                QuestionExtractionExecutionProcessorError("failed"),
            ),
        )[0]

        self.assertEqual(
            summary,
            QuestionExtractionWorkerSummary(
                discovered=3,
                succeeded=1,
                failed=2,
                start_skipped=0,
            ),
        )

        self.sessions[1].rollback.assert_called_once_with()
        self.sessions[2].rollback.assert_not_called()
        self.sessions[3].rollback.assert_called_once_with()

    def test_unexpected_execution_failure_is_counted_and_batch_continues(
        self,
    ) -> None:
        ids = tuple(uuid.uuid4() for _ in range(2))

        summary = self._run(
            pending_ids=ids,
            execution_effects=(
                RuntimeError("private detail"),
                None,
            ),
        )[0]

        self.assertEqual(
            summary,
            QuestionExtractionWorkerSummary(
                discovered=2,
                succeeded=1,
                failed=1,
                start_skipped=0,
            ),
        )
        self.sessions[1].rollback.assert_called_once_with()
        self.sessions[2].rollback.assert_not_called()

    def test_summary_is_frozen_slotted_and_rejects_invalid_counts(self) -> None:
        summary = QuestionExtractionWorkerSummary(1, 1, 0, 0)

        with self.assertRaises(FrozenInstanceError):
            summary.succeeded = 2  # type: ignore[misc]

        self.assertFalse(hasattr(summary, "__dict__"))

        invalid_values = (-1, True, 1.5)
        for invalid in invalid_values:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                QuestionExtractionWorkerSummary(
                    invalid, 0, 0, 0  # type: ignore[arg-type]
                )

    def test_summary_counts_must_not_exceed_discovered(self) -> None:
        with self.assertRaises(ValueError):
            QuestionExtractionWorkerSummary(
                discovered=1,
                succeeded=1,
                failed=1,
                start_skipped=0,
            )

    def test_worker_batch_config_is_strict_and_bounded(self) -> None:
        self.assertEqual(
            Settings().QUESTION_EXTRACTION_WORKER_BATCH_SIZE,
            10,
        )

        for invalid in (0, 101, True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                Settings(
                    QUESTION_EXTRACTION_WORKER_BATCH_SIZE=invalid
                )

    def test_execution_mode_config_is_explicit_and_api_key_independent(self) -> None:
        self.assertEqual(Settings().QUESTION_EXTRACTION_EXECUTION_MODE, "legacy")
        self.assertEqual(
            Settings(
                QUESTION_EXTRACTION_EXECUTION_MODE="document_analysis"
            ).QUESTION_EXTRACTION_EXECUTION_MODE,
            "document_analysis",
        )
        self.assertEqual(
            Settings(OPENAI_API_KEY="configured").QUESTION_EXTRACTION_EXECUTION_MODE,
            "legacy",
        )
        with self.assertRaises(ValueError):
            Settings(QUESTION_EXTRACTION_EXECUTION_MODE="automatic")

    def test_worker_module_has_no_recovery_watchdog_or_lease_boundary(
        self,
    ) -> None:
        module = Path(
            BACKEND_DIR
            / "app/services/question_extraction_worker_service.py"
        ).read_text(encoding="utf-8")

        for forbidden in (
            "heartbeat",
            "watchdog",
            "lease",
            "recovery",
            "stale",
            "SourcePreAnalysis",
        ):
            self.assertNotIn(forbidden.lower(), module.lower())


if __name__ == "__main__":
    unittest.main()
