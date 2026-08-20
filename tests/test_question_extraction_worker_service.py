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
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionExecutionService",
                side_effect=execution_factory,
            ),
        ):
            summary = QuestionExtractionWorkerService(
                session_factory=self.session_factory,
                worker_batch_size=worker_batch_size,
                selector_factory=selector_factory,
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
            patch(
                "app.services.question_extraction_worker_service."
                "QuestionExtractionExecutionService"
            ) as execution_class,
        ):
            QuestionExtractionWorkerService(
                session_factory=factory,
                selector_factory=lambda: object(),
            ).run_once()

        self.assertLess(
            events.index("close-0"),
            events.index("open-1"),
        )
        execution_class.return_value.execute_run.assert_called_once_with(
            run_id=run_id
        )

    def test_each_run_gets_new_session_selector_and_one_attempt(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))

        result = self._run(pending_ids=ids)
        summary, _, executions, selector_factory = result[:4]

        self.assertEqual(summary.discovered, 3)
        self.assertEqual(summary.succeeded, 3)
        self.assertEqual(summary.failed, 0)
        self.assertEqual(summary.start_skipped, 0)

        self.assertEqual(len(self.sessions), 4)
        self.assertEqual(selector_factory.call_count, 3)
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
