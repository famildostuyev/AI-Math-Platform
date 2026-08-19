from __future__ import annotations

import os
import sys
import time
import unittest
import uuid
from dataclasses import FrozenInstanceError
from pathlib import Path
from types import SimpleNamespace
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
from app.services.source_pre_analysis_execution_service import (
    SourcePreAnalysisExecutionFinalizationError,
    SourcePreAnalysisExecutionProcessorError,
    SourcePreAnalysisExecutionReconciliationRequiredError,
    SourcePreAnalysisExecutionStartError,
)
from app.services.source_pre_analysis_recovery_service import (
    SourcePreAnalysisRecoveryOutcome,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisLeaseMismatchError,
)
from app.services.source_pre_analysis_worker_service import (
    SourcePreAnalysisWorkerService,
    SourcePreAnalysisWorkerSummary,
    _HeartbeatWatchdog,
    _WatchdogLifecycleService,
)


class SourcePreAnalysisWorkerServiceTest(unittest.TestCase):
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
        recovery_ids=(),
        recovery_outcomes=(),
        pending_ids=(),
        execution_effects=(),
    ):
        recovery = MagicMock()
        recovery.list_recovery_candidate_ids.return_value = tuple(recovery_ids)
        recovery.recover_stale_run.side_effect = [
            SimpleNamespace(outcome=outcome) for outcome in recovery_outcomes
        ]
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

        watchdogs = []

        def watchdog_factory(**kwargs):
            watchdog = MagicMock()
            watchdogs.append(watchdog)
            return watchdog

        selector_factory = MagicMock(side_effect=lambda: object())
        with (
            patch(
                "app.services.source_pre_analysis_worker_service."
                "SourcePreAnalysisRecoveryService",
                return_value=recovery,
            ) as recovery_class,
            patch(
                "app.services.source_pre_analysis_worker_service."
                "SourcePreAnalysisDispatchService",
                return_value=dispatch,
            ) as dispatch_class,
            patch(
                "app.services.source_pre_analysis_worker_service."
                "SourcePreAnalysisExecutionService",
                side_effect=execution_factory,
            ),
        ):
            summary = SourcePreAnalysisWorkerService(
                session_factory=self.session_factory,
                worker_batch_size=7,
                recovery_batch_size=5,
                selector_factory=selector_factory,
                watchdog_factory=watchdog_factory,
            ).run_once()
        return (
            summary,
            recovery,
            dispatch,
            executions,
            watchdogs,
            selector_factory,
            recovery_class,
            dispatch_class,
        )

    def test_zero_work_is_bounded_recovery_first_and_closes_sessions(self) -> None:
        result = self._run()
        summary, recovery, dispatch = result[:3]
        recovery.list_recovery_candidate_ids.assert_called_once()
        self.assertEqual(
            recovery.list_recovery_candidate_ids.call_args.kwargs["limit"], 5
        )
        dispatch.list_pending_run_ids.assert_called_once_with(limit=7)
        self.assertEqual(summary, SourcePreAnalysisWorkerSummary(0, 0, 0, 0, 0, 0))
        self.assertEqual(len(self.sessions), 2)
        for session in self.sessions:
            session.close.assert_called_once_with()

    def test_recovery_outcomes_are_counted_exactly(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))
        summary, recovery = self._run(
            recovery_ids=ids,
            recovery_outcomes=(
                SourcePreAnalysisRecoveryOutcome.RECOVERED,
                SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED,
                SourcePreAnalysisRecoveryOutcome.SKIPPED,
            ),
        )[:2]
        self.assertEqual(summary.stale_recovered, 1)
        self.assertEqual(summary.reconciliation_required, 1)
        self.assertEqual(
            [item.kwargs["run_id"] for item in recovery.recover_stale_run.call_args_list],
            list(ids),
        )

    def test_one_recovery_failure_does_not_stop_later_candidates(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(2))
        recovery = MagicMock()
        recovery.list_recovery_candidate_ids.return_value = ids
        recovery.recover_stale_run.side_effect = [
            RuntimeError("sensitive"),
            SimpleNamespace(outcome=SourcePreAnalysisRecoveryOutcome.RECOVERED),
        ]
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = ()
        with (
            patch(
                "app.services.source_pre_analysis_worker_service.SourcePreAnalysisRecoveryService",
                return_value=recovery,
            ),
            patch(
                "app.services.source_pre_analysis_worker_service.SourcePreAnalysisDispatchService",
                return_value=dispatch,
            ),
        ):
            summary = SourcePreAnalysisWorkerService(
                session_factory=self.session_factory
            ).run_once()
        self.assertEqual(summary.stale_recovered, 1)
        self.sessions[0].rollback.assert_called_once_with()

    def test_discovery_session_closes_before_per_run_sessions_open(self) -> None:
        run_id = uuid.uuid4()
        events = []
        sessions = []

        def factory():
            session = MagicMock()
            session.close.side_effect = lambda: events.append(
                f"close-{len(sessions) - 1}"
            )
            sessions.append(session)
            events.append(f"open-{len(sessions) - 1}")
            return session

        recovery = MagicMock()
        recovery.list_recovery_candidate_ids.return_value = ()
        dispatch = MagicMock()
        dispatch.list_pending_run_ids.return_value = (run_id,)
        with (
            patch("app.services.source_pre_analysis_worker_service.SourcePreAnalysisRecoveryService", return_value=recovery),
            patch("app.services.source_pre_analysis_worker_service.SourcePreAnalysisDispatchService", return_value=dispatch),
            patch("app.services.source_pre_analysis_worker_service.SourcePreAnalysisExecutionService") as execution,
        ):
            SourcePreAnalysisWorkerService(
                session_factory=factory,
                watchdog_factory=lambda **kwargs: MagicMock(),
            ).run_once()
        self.assertLess(events.index("close-1"), events.index("open-2"))
        execution.return_value.execute_run.assert_called_once_with(run_id=run_id)

    def test_each_run_gets_new_session_selector_and_one_attempt(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(3))
        result = self._run(pending_ids=ids)
        summary, _, _, executions, watchdogs, selector_factory = result[:6]
        self.assertEqual(summary.discovered, 3)
        self.assertEqual(summary.succeeded, 3)
        self.assertEqual(len(self.sessions), 5)
        self.assertEqual(selector_factory.call_count, 3)
        self.assertEqual(
            [execution.execute_run.call_args for execution in executions],
            [call(run_id=run_id) for run_id in ids],
        )
        self.assertEqual(len(watchdogs), 3)
        for watchdog in watchdogs:
            watchdog.stop.assert_called_once_with()

    def test_execution_outcomes_are_exclusive_and_later_runs_continue(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(4))
        reconciliation = SourcePreAnalysisExecutionReconciliationRequiredError(
            execution_error=SourcePreAnalysisExecutionFinalizationError("failed"),
            transition_error=RuntimeError("conflict"),
        )
        summary = self._run(
            pending_ids=ids,
            execution_effects=(
                None,
                SourcePreAnalysisExecutionProcessorError("failed"),
                SourcePreAnalysisExecutionStartError("claimed"),
                reconciliation,
            ),
        )[0]
        self.assertEqual(
            summary,
            SourcePreAnalysisWorkerSummary(4, 1, 1, 1, 1, 0),
        )
        for session in self.sessions[2:]:
            session.close.assert_called_once_with()

    def test_run_level_failures_rollback_without_retry(self) -> None:
        ids = tuple(uuid.uuid4() for _ in range(2))
        result = self._run(
            pending_ids=ids,
            execution_effects=(
                SourcePreAnalysisExecutionProcessorError("failed"),
                None,
            ),
        )
        executions = result[3]
        self.assertEqual([item.execute_run.call_count for item in executions], [1, 1])
        self.sessions[2].rollback.assert_called_once_with()
        self.sessions[3].rollback.assert_not_called()

    def test_summary_is_frozen_slotted_and_rejects_invalid_counts(self) -> None:
        summary = SourcePreAnalysisWorkerSummary(1, 1, 0, 0, 0, 0)
        with self.assertRaises(FrozenInstanceError):
            summary.succeeded = 2  # type: ignore[misc]
        self.assertFalse(hasattr(summary, "__dict__"))
        for invalid in (-1, True, 1.5):
            with self.assertRaises(ValueError):
                SourcePreAnalysisWorkerSummary(invalid, 0, 0, 0, 0, 0)  # type: ignore[arg-type]

    def test_worker_batch_config_is_strict_and_bounded(self) -> None:
        self.assertEqual(Settings().SOURCE_PRE_ANALYSIS_WORKER_BATCH_SIZE, 10)
        for invalid in (0, 101, True):
            with self.assertRaises(ValueError):
                Settings(SOURCE_PRE_ANALYSIS_WORKER_BATCH_SIZE=invalid)

    def test_lifecycle_wrapper_starts_watchdog_with_server_claim(self) -> None:
        run_id, lease_id = uuid.uuid4(), uuid.uuid4()
        watchdog = MagicMock()
        claim = SimpleNamespace(run_id=run_id, execution_lease_id=lease_id)
        with patch(
            "app.services.source_pre_analysis_worker_service.SourcePreAnalysisService"
        ) as service_class:
            service_class.return_value.start_run.return_value = claim
            wrapper = _WatchdogLifecycleService(MagicMock(), watchdog=watchdog)
            self.assertIs(wrapper.start_run(run_id=run_id), claim)
        watchdog.start.assert_called_once_with(
            run_id=run_id, execution_lease_id=lease_id
        )

    def test_watchdog_heartbeats_with_separate_sessions_and_matching_lease(self) -> None:
        run_id, lease_id = uuid.uuid4(), uuid.uuid4()
        session = MagicMock()
        heartbeat_called = __import__("threading").Event()
        with patch(
            "app.services.source_pre_analysis_worker_service.SourcePreAnalysisService"
        ) as service_class:
            service_class.return_value.heartbeat_run.side_effect = (
                lambda **kwargs: heartbeat_called.set()
            )
            watchdog = _HeartbeatWatchdog(
                session_factory=MagicMock(return_value=session),
                interval_seconds=0.01,
            )
            watchdog.start(run_id=run_id, execution_lease_id=lease_id)
            self.assertTrue(heartbeat_called.wait(1))
            watchdog.stop()
        service_class.return_value.heartbeat_run.assert_called_with(
            run_id=run_id, execution_lease_id=lease_id
        )
        session.close.assert_called()

    def test_watchdog_stops_on_lease_loss_without_logging_lease(self) -> None:
        run_id, lease_id = uuid.uuid4(), uuid.uuid4()
        session = MagicMock()
        with (
            patch(
                "app.services.source_pre_analysis_worker_service.SourcePreAnalysisService"
            ) as service_class,
            self.assertLogs(
                "app.services.source_pre_analysis_worker_service", level="INFO"
            ) as logs,
        ):
            service_class.return_value.heartbeat_run.side_effect = (
                SourcePreAnalysisLeaseMismatchError("secret")
            )
            watchdog = _HeartbeatWatchdog(
                session_factory=MagicMock(return_value=session),
                interval_seconds=0.01,
            )
            watchdog.start(run_id=run_id, execution_lease_id=lease_id)
            time.sleep(0.05)
            watchdog.stop()
        self.assertEqual(service_class.return_value.heartbeat_run.call_count, 1)
        self.assertNotIn(str(lease_id), " ".join(logs.output))
        session.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
