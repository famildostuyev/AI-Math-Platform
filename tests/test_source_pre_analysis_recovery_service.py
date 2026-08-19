from __future__ import annotations

import os
import sys
import unittest
import uuid
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError


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

from app.core.config import Settings, settings
from app.core.enums import SourcePreAnalysisRunStatus
from app.services.source_pre_analysis_recovery_service import (
    MAX_RECOVERY_BATCH_SIZE,
    STALE_RUN_FAILURE_MESSAGE,
    SourcePreAnalysisRecoveryError,
    SourcePreAnalysisRecoveryOutcome,
    SourcePreAnalysisRecoveryPersistenceConflictError,
    SourcePreAnalysisRecoveryResult,
    SourcePreAnalysisRecoveryService,
    SourcePreAnalysisRecoveryValidationError,
)


NOW = datetime(2026, 8, 19, 12, 0, tzinfo=timezone.utc)
STALE_BEFORE = NOW - timedelta(minutes=15)


class SourcePreAnalysisRecoveryServiceTest(unittest.TestCase):
    @staticmethod
    def _run(
        *,
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.RUNNING,
        heartbeat: datetime | None = STALE_BEFORE - timedelta(seconds=1),
        lease_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            status=status,
            execution_lease_id=lease_id or uuid.uuid4(),
            last_heartbeat_at=heartbeat,
            completed_at=None,
            failure_message=None,
        )

    def test_config_defaults_and_validation_are_exact(self) -> None:
        self.assertEqual(settings.SOURCE_PRE_ANALYSIS_LEASE_SECONDS, 900)
        self.assertEqual(settings.SOURCE_PRE_ANALYSIS_HEARTBEAT_SECONDS, 30)
        self.assertEqual(settings.SOURCE_PRE_ANALYSIS_RECOVERY_BATCH_SIZE, 10)
        with self.assertRaises(ValidationError):
            Settings(
                SOURCE_PRE_ANALYSIS_LEASE_SECONDS=30,
                SOURCE_PRE_ANALYSIS_HEARTBEAT_SECONDS=30,
            )
        with self.assertRaises(ValidationError):
            Settings(SOURCE_PRE_ANALYSIS_RECOVERY_BATCH_SIZE=101)
        with self.assertRaises(ValidationError):
            Settings(SOURCE_PRE_ANALYSIS_LEASE_SECONDS=True)

    def test_discovery_query_has_exact_scope_order_limit_and_no_lock(self) -> None:
        first, second = uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.scalars.return_value.all.return_value = [first, second]

        result = SourcePreAnalysisRecoveryService(
            db,
        ).list_recovery_candidate_ids(
            stale_before=STALE_BEFORE,
            limit=17,
        )

        self.assertEqual(result, (first, second))
        self.assertTrue(all(type(item) is uuid.UUID for item in result))
        statement = db.scalars.call_args.args[0]
        sql = str(statement)
        whereclause = str(statement.whereclause)
        self.assertIn("source_pre_analysis_runs.status", whereclause)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", whereclause)
        self.assertIn("execution_lease_id IS NULL", whereclause)
        self.assertIn("last_heartbeat_at IS NULL", whereclause)
        self.assertIn("last_heartbeat_at <", whereclause)
        self.assertIn("CASE WHEN", sql)
        self.assertIn("last_heartbeat_at ASC", sql)
        self.assertIn("source_pre_analysis_runs.id ASC", sql)
        self.assertEqual(statement._limit_clause.value, 17)
        self.assertNotIn("FOR UPDATE", sql)
        db.commit.assert_not_called()
        db.rollback.assert_not_called()
        db.add.assert_not_called()
        db.flush.assert_not_called()

    def test_discovery_validation_is_strict_and_query_free(self) -> None:
        invalid = (
            (datetime(2026, 8, 19, 12, 0), 1),
            ("bad", 1),
            (STALE_BEFORE, True),
            (STALE_BEFORE, 0),
            (STALE_BEFORE, -1),
            (STALE_BEFORE, 1.0),
            (STALE_BEFORE, MAX_RECOVERY_BATCH_SIZE + 1),
        )
        for stale_before, limit in invalid:
            with self.subTest(stale_before=stale_before, limit=limit):
                db = MagicMock()
                with self.assertRaises(
                    SourcePreAnalysisRecoveryValidationError,
                ) as raised:
                    SourcePreAnalysisRecoveryService(
                        db,
                    ).list_recovery_candidate_ids(
                        stale_before=stale_before,  # type: ignore[arg-type]
                        limit=limit,  # type: ignore[arg-type]
                    )
                self.assertIsInstance(
                    raised.exception,
                    SourcePreAnalysisRecoveryError,
                )
                db.scalars.assert_not_called()

    def test_stale_consistent_run_is_recovered_atomically(self) -> None:
        run = self._run()
        original_lease = run.execution_lease_id
        db = MagicMock()
        db.scalar.side_effect = [run, None]

        with patch(
            "app.services.source_pre_analysis_recovery_service.utc_now",
            return_value=NOW,
        ):
            result = SourcePreAnalysisRecoveryService(db).recover_stale_run(
                run_id=run.id,
                stale_before=STALE_BEFORE,
            )

        self.assertEqual(
            result,
            SourcePreAnalysisRecoveryResult(
                run_id=run.id,
                outcome=SourcePreAnalysisRecoveryOutcome.RECOVERED,
            ),
        )
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.FAILED)
        self.assertEqual(run.completed_at, NOW)
        self.assertEqual(run.failure_message, STALE_RUN_FAILURE_MESSAGE)
        self.assertEqual(
            STALE_RUN_FAILURE_MESSAGE,
            "Pre-analysis execution was interrupted before completion.",
        )
        self.assertIsNotNone(original_lease)
        self.assertIsNone(run.execution_lease_id)
        self.assertIsNone(run.last_heartbeat_at)
        self.assertIn("FOR UPDATE", str(db.scalar.call_args_list[0].args[0]))
        result_query = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("source_pre_analysis_results", result_query)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_fresh_or_terminal_state_after_lock_is_skipped(self) -> None:
        cases = (
            self._run(heartbeat=STALE_BEFORE),
            self._run(status=SourcePreAnalysisRunStatus.SUCCEEDED),
            None,
        )
        for run in cases:
            with self.subTest(run=run):
                db = MagicMock()
                db.scalar.return_value = run
                run_id = run.id if run is not None else uuid.uuid4()

                result = SourcePreAnalysisRecoveryService(
                    db,
                ).recover_stale_run(
                    run_id=run_id,
                    stale_before=STALE_BEFORE,
                )

                self.assertEqual(
                    result.outcome,
                    SourcePreAnalysisRecoveryOutcome.SKIPPED,
                )
                self.assertEqual(db.scalar.call_count, 1)
                db.commit.assert_called_once_with()

    def test_missing_lease_or_heartbeat_requires_reconciliation(self) -> None:
        cases = (
            self._run(lease_id=uuid.uuid4()),
            self._run(heartbeat=None),
        )
        cases[0].execution_lease_id = None
        for run in cases:
            with self.subTest(run=run):
                db = MagicMock()
                db.scalar.return_value = run

                result = SourcePreAnalysisRecoveryService(
                    db,
                ).recover_stale_run(
                    run_id=run.id,
                    stale_before=STALE_BEFORE,
                )

                self.assertEqual(
                    result.outcome,
                    SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED,
                )
                self.assertEqual(run.status, SourcePreAnalysisRunStatus.RUNNING)
                db.commit.assert_called_once_with()

    def test_existing_result_requires_reconciliation_without_mutation(self) -> None:
        run = self._run()
        db = MagicMock()
        db.scalar.side_effect = [run, uuid.uuid4()]

        result = SourcePreAnalysisRecoveryService(db).recover_stale_run(
            run_id=run.id,
            stale_before=STALE_BEFORE,
        )

        self.assertEqual(
            result.outcome,
            SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED,
        )
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.RUNNING)
        self.assertIsNotNone(run.execution_lease_id)
        self.assertIsNotNone(run.last_heartbeat_at)
        db.commit.assert_called_once_with()

    def test_integrity_conflict_rolls_back_and_preserves_cause(self) -> None:
        run = self._run()
        db = MagicMock()
        db.scalar.side_effect = [run, None]
        failure = IntegrityError("recover", {}, Exception("conflict"))
        db.commit.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisRecoveryPersistenceConflictError,
        ) as raised:
            SourcePreAnalysisRecoveryService(db).recover_stale_run(
                run_id=run.id,
                stale_before=STALE_BEFORE,
            )

        self.assertIs(raised.exception.__cause__, failure)
        db.rollback.assert_called_once_with()

    def test_result_dto_is_frozen_slotted_and_no_operational_work_is_exposed(self) -> None:
        result = SourcePreAnalysisRecoveryResult(
            run_id=uuid.uuid4(),
            outcome=SourcePreAnalysisRecoveryOutcome.SKIPPED,
        )
        self.assertFalse(hasattr(result, "__dict__"))
        with self.assertRaises(FrozenInstanceError):
            result.outcome = SourcePreAnalysisRecoveryOutcome.RECOVERED  # type: ignore[misc]
        for method in (
            "retry", "create_run", "process", "resolve_source", "delete_pages",
        ):
            self.assertFalse(hasattr(SourcePreAnalysisRecoveryService, method))


if __name__ == "__main__":
    unittest.main()
