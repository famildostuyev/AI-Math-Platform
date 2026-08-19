from __future__ import annotations

import os
import sys
import unittest
import uuid
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import UniqueConstraint
from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.models.source_pre_analysis_finding import SourcePreAnalysisFinding
from app.models.source_pre_analysis_result import SourcePreAnalysisResult
from app.models.source_pre_analysis_run import SourcePreAnalysisRun
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorProvenance,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisActiveRunExistsError,
    SourcePreAnalysisFinalization,
    SourcePreAnalysisFindingInput,
    SourcePreAnalysisInvalidRunStateError,
    SourcePreAnalysisLeaseMismatchError,
    SourcePreAnalysisPageDocumentMismatchError,
    SourcePreAnalysisPageNotFoundError,
    SourcePreAnalysisPersistenceConflictError,
    SourcePreAnalysisResultAlreadyExistsError,
    SourcePreAnalysisResultInput,
    SourcePreAnalysisRequestedByUserNotFoundError,
    SourcePreAnalysisRunNotFoundError,
    SourcePreAnalysisRunClaim,
    SourcePreAnalysisService,
    SourcePreAnalysisSourceDocumentNotFoundError,
    SourcePreAnalysisValidationError,
)


NOW = datetime(2026, 8, 18, 10, 30, tzinfo=timezone.utc)
LEASE_ID = uuid.uuid4()
VALID_PROVENANCE = SourcePreAnalysisProcessorProvenance(
    processor_name="test-processor",
    processor_version="1",
)


class SourcePreAnalysisServiceStartRunTest(unittest.TestCase):
    @staticmethod
    def _run(
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.PENDING,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            source_document_id=uuid.uuid4(),
            status=status,
            started_at=None,
            completed_at=None,
            failure_message=None,
            execution_lease_id=None,
            last_heartbeat_at=None,
        )

    def test_constructor_stores_session(self) -> None:
        db = MagicMock()

        service = SourcePreAnalysisService(db)

        self.assertIs(service.db, db)

    def test_pending_active_run_transitions_to_running(self) -> None:
        db = MagicMock()
        run = self._run()
        run.completed_at = NOW
        run.failure_message = "old value"
        db.scalar.return_value = run

        with patch(
            "app.services.source_pre_analysis_service.utc_now",
            return_value=NOW,
        ) as clock:
            returned = SourcePreAnalysisService(db).start_run(run_id=run.id)

        self.assertIsInstance(returned, SourcePreAnalysisRunClaim)
        self.assertEqual(returned.run_id, run.id)
        self.assertEqual(returned.execution_lease_id, run.execution_lease_id)
        self.assertEqual(returned.started_at, NOW)
        self.assertEqual(returned.last_heartbeat_at, NOW)
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.RUNNING)
        self.assertEqual(run.started_at, NOW)
        self.assertIsNone(run.completed_at)
        self.assertIsNone(run.failure_message)
        self.assertIsInstance(run.execution_lease_id, uuid.UUID)
        self.assertEqual(run.last_heartbeat_at, NOW)
        clock.assert_called_once_with()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.flush.assert_not_called()

    def test_query_requires_active_run_and_document_with_lock(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.return_value = run

        SourcePreAnalysisService(db).start_run(run_id=run.id)

        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("source_pre_analysis_runs.id", statement)
        self.assertIn("source_pre_analysis_runs.source_document_id", statement)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", statement)
        self.assertIn("source_documents.deleted_at IS NULL", statement)
        self.assertIn("JOIN source_documents", statement)
        self.assertIn("FOR UPDATE", statement)
        self.assertEqual(db.scalar.call_count, 1)

    def test_unavailable_run_or_owning_document_is_not_found(self) -> None:
        for unavailable_state in (
            "missing run",
            "soft-deleted run",
            "missing owning document",
            "soft-deleted owning document",
        ):
            with self.subTest(unavailable_state=unavailable_state):
                db = MagicMock()
                db.scalar.return_value = None

                with self.assertRaises(SourcePreAnalysisRunNotFoundError):
                    SourcePreAnalysisService(db).start_run(run_id=uuid.uuid4())

                statement = str(db.scalar.call_args.args[0])
                self.assertIn(
                    "source_pre_analysis_runs.deleted_at IS NULL", statement,
                )
                self.assertIn("source_documents.deleted_at IS NULL", statement)
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()
                db.add.assert_not_called()
                db.flush.assert_not_called()

    def test_non_pending_states_are_rejected_without_mutation(self) -> None:
        for status in (
            SourcePreAnalysisRunStatus.RUNNING,
            SourcePreAnalysisRunStatus.SUCCEEDED,
            SourcePreAnalysisRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                run = self._run(status)
                original = (
                    run.status,
                    run.started_at,
                    run.completed_at,
                    run.failure_message,
                )
                db.scalar.return_value = run

                with self.assertRaises(SourcePreAnalysisInvalidRunStateError):
                    SourcePreAnalysisService(db).start_run(run_id=run.id)

                self.assertEqual(
                    (
                        run.status,
                        run.started_at,
                        run.completed_at,
                        run.failure_message,
                    ),
                    original,
                )
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()
                db.add.assert_not_called()
                db.flush.assert_not_called()

    def test_commit_failure_rolls_back_and_propagates(self) -> None:
        db = MagicMock()
        run = self._run()
        failure = RuntimeError("commit failed")
        db.scalar.return_value = run
        db.commit.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).start_run(run_id=run.id)

        self.assertIs(raised.exception, failure)
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()

    def test_query_failure_rolls_back_and_propagates(self) -> None:
        db = MagicMock()
        failure = RuntimeError("query failed")
        db.scalar.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).start_run(run_id=uuid.uuid4())

        self.assertIs(raised.exception, failure)
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()
        db.add.assert_not_called()
        db.flush.assert_not_called()


class SourcePreAnalysisServiceHeartbeatTest(unittest.TestCase):
    @staticmethod
    def _run(
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.RUNNING,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            source_document_id=uuid.uuid4(),
            status=status,
            execution_lease_id=LEASE_ID,
            last_heartbeat_at=NOW,
        )

    def test_matching_running_lease_refreshes_and_commits_once(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.return_value = run
        refreshed = datetime(2026, 8, 18, 10, 31, tzinfo=timezone.utc)

        with patch(
            "app.services.source_pre_analysis_service.utc_now",
            return_value=refreshed,
        ):
            returned = SourcePreAnalysisService(db).heartbeat_run(
                run_id=run.id,
                execution_lease_id=LEASE_ID,
            )

        self.assertEqual(returned, refreshed)
        self.assertEqual(run.last_heartbeat_at, refreshed)
        self.assertEqual(run.execution_lease_id, LEASE_ID)
        self.assertIn("FOR UPDATE", str(db.scalar.call_args.args[0]))
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_wrong_lease_and_terminal_states_are_rejected(self) -> None:
        cases = (
            (self._run(), uuid.uuid4(), SourcePreAnalysisLeaseMismatchError),
            (
                self._run(SourcePreAnalysisRunStatus.SUCCEEDED),
                LEASE_ID,
                SourcePreAnalysisInvalidRunStateError,
            ),
        )
        for run, lease_id, error in cases:
            with self.subTest(error=error):
                db = MagicMock()
                db.scalar.return_value = run
                with self.assertRaises(error):
                    SourcePreAnalysisService(db).heartbeat_run(
                        run_id=run.id,
                        execution_lease_id=lease_id,
                    )
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_heartbeat_commit_failure_rolls_back_unchanged_exception(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.return_value = run
        failure = RuntimeError("commit failed")
        db.commit.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).heartbeat_run(
                run_id=run.id,
                execution_lease_id=LEASE_ID,
            )

        self.assertIs(raised.exception, failure)
        db.rollback.assert_called_once_with()


class SourcePreAnalysisServiceFinalizeSuccessTest(unittest.TestCase):
    @staticmethod
    def _run(
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.RUNNING,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(), source_document_id=uuid.uuid4(), status=status,
            started_at=NOW, completed_at=None, failure_message="stale failure",
            execution_lease_id=LEASE_ID, last_heartbeat_at=NOW,
        )

    @staticmethod
    def _finding(
        *,
        page_id: uuid.UUID | None = None,
        code: object = " formula_present ",
        severity: object = SourcePreAnalysisFindingSeverity.INFO,
        confidence: object = Decimal("0.8750"),
        message: object = " Formula content was detected. ",
    ) -> SourcePreAnalysisFindingInput:
        return SourcePreAnalysisFindingInput(
            source_document_page_id=page_id,
            finding_code=code,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            confidence=confidence,  # type: ignore[arg-type]
            message=message,  # type: ignore[arg-type]
        )

    def _db(
        self,
        *,
        run: SimpleNamespace | None = None,
        existing_result: object | None = None,
        pages: list[SimpleNamespace] | None = None,
    ) -> tuple[MagicMock, SimpleNamespace]:
        db = MagicMock()
        selected_run = run or self._run()
        db.scalar.side_effect = [selected_run, existing_result]
        db.scalars.return_value.all.return_value = pages or []

        def assign_result_id() -> None:
            db.add.call_args.args[0].id = uuid.uuid4()

        db.flush.side_effect = assign_result_id
        return db, selected_run

    def test_zero_finding_finalization_is_atomic_and_typed(self) -> None:
        db, run = self._db()
        started_at = run.started_at
        with patch(
            "app.services.source_pre_analysis_service.utc_now", return_value=NOW,
        ) as clock:
            finalized = SourcePreAnalysisService(db).finalize_success(
                run_id=run.id,
                execution_lease_id=run.execution_lease_id,
                result=SourcePreAnalysisResultInput(
                    schema_version=2, page_count=None,
                ),
                findings=[],
                provenance=VALID_PROVENANCE,
            )

        self.assertIsInstance(finalized, SourcePreAnalysisFinalization)
        self.assertIsInstance(finalized.result, SourcePreAnalysisResult)
        self.assertEqual(finalized.result.source_pre_analysis_run_id, run.id)
        self.assertEqual(finalized.result.schema_version, 2)
        self.assertIsNone(finalized.result.page_count)
        self.assertEqual(finalized.findings, ())
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.SUCCEEDED)
        self.assertEqual(run.completed_at, NOW)
        self.assertEqual(run.started_at, started_at)
        self.assertIsNone(run.failure_message)
        self.assertIsNone(run.execution_lease_id)
        self.assertIsNone(run.last_heartbeat_at)
        clock.assert_called_once_with()
        db.add.assert_called_once_with(finalized.result)
        db.flush.assert_called_once_with()
        db.add_all.assert_not_called()
        db.scalars.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_findings_are_normalized_ordered_and_added_after_flush(self) -> None:
        db, run = self._db()
        finalized = SourcePreAnalysisService(db).finalize_success(
            run_id=run.id,
            execution_lease_id=run.execution_lease_id,
            result=SourcePreAnalysisResultInput(page_count=0),
            findings=[
                self._finding(code=" first ", confidence=None, message=" First "),
                self._finding(
                    code="second",
                    severity=SourcePreAnalysisFindingSeverity.WARNING,
                    confidence=Decimal("1"), message="Second",
                ),
            ],
            provenance=VALID_PROVENANCE,
        )

        self.assertEqual(finalized.result.page_count, 0)
        self.assertEqual(
            [item.sequence_number for item in finalized.findings], [1, 2],
        )
        self.assertEqual(
            [item.finding_code for item in finalized.findings],
            ["first", "second"],
        )
        self.assertEqual(
            [item.message for item in finalized.findings], ["First", "Second"],
        )
        self.assertIsNone(finalized.findings[0].confidence)
        self.assertTrue(
            all(isinstance(item, SourcePreAnalysisFinding)
                for item in finalized.findings)
        )
        self.assertTrue(
            all(item.source_pre_analysis_result_id == finalized.result.id
                for item in finalized.findings)
        )
        names = [call[0] for call in db.method_calls]
        self.assertLess(names.index("add"), names.index("flush"))
        self.assertLess(names.index("flush"), names.index("add_all"))
        self.assertEqual(tuple(db.add_all.call_args.args[0]), finalized.findings)
        db.commit.assert_called_once_with()

    def test_page_findings_use_one_locked_batch_and_allow_repeats(self) -> None:
        first_id, second_id = uuid.uuid4(), uuid.uuid4()
        run = self._run()
        pages = [
            SimpleNamespace(id=first_id, source_document_id=run.source_document_id),
            SimpleNamespace(id=second_id, source_document_id=run.source_document_id),
        ]
        db, _ = self._db(run=run, pages=pages)
        finalized = SourcePreAnalysisService(db).finalize_success(
            run_id=run.id,
            execution_lease_id=run.execution_lease_id,
            result=SourcePreAnalysisResultInput(page_count=5),
            findings=[
                self._finding(page_id=first_id, code="one"),
                self._finding(page_id=first_id, code="two"),
                self._finding(page_id=second_id, code="three"),
            ],
            provenance=VALID_PROVENANCE,
        )

        self.assertEqual(
            [item.source_document_page_id for item in finalized.findings],
            [first_id, first_id, second_id],
        )
        db.scalars.assert_called_once()
        statement = str(db.scalars.call_args.args[0])
        self.assertIn("source_document_pages.id IN", statement)
        self.assertIn("source_document_pages.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_run_lock_and_result_query_have_exact_scope(self) -> None:
        db, run = self._db()
        SourcePreAnalysisService(db).finalize_success(
            run_id=run.id, execution_lease_id=run.execution_lease_id,
            result=SourcePreAnalysisResultInput(), findings=[],
            provenance=VALID_PROVENANCE,
        )

        run_query = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", run_query)
        self.assertIn("source_documents.deleted_at IS NULL", run_query)
        self.assertIn("FOR UPDATE", run_query)
        result_statement = db.scalar.call_args_list[1].args[0]
        result_query = str(result_statement)
        self.assertIn(
            "source_pre_analysis_results.source_pre_analysis_run_id", result_query,
        )
        self.assertNotIn(
            "source_pre_analysis_results.deleted_at",
            str(result_statement.whereclause),
        )

    def test_existing_result_even_soft_deleted_blocks_finalization(self) -> None:
        for deleted_at in (None, NOW):
            with self.subTest(deleted_at=deleted_at):
                db, run = self._db(
                    existing_result=SimpleNamespace(
                        id=uuid.uuid4(), deleted_at=deleted_at,
                    )
                )
                with self.assertRaises(SourcePreAnalysisResultAlreadyExistsError):
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        result=SourcePreAnalysisResultInput(), findings=[],
                        provenance=VALID_PROVENANCE,
                    )
                db.add.assert_not_called()
                db.flush.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_wrong_execution_lease_cannot_finalize(self) -> None:
        db, run = self._db()

        with self.assertRaises(SourcePreAnalysisLeaseMismatchError):
            SourcePreAnalysisService(db).finalize_success(
                run_id=run.id,
                execution_lease_id=uuid.uuid4(),
                result=SourcePreAnalysisResultInput(),
                findings=[],
                provenance=VALID_PROVENANCE,
            )

        self.assertEqual(db.scalar.call_count, 1)
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_non_running_states_are_rejected_before_result_lookup(self) -> None:
        for status in (
            SourcePreAnalysisRunStatus.PENDING,
            SourcePreAnalysisRunStatus.SUCCEEDED,
            SourcePreAnalysisRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                run = self._run(status)
                db, _ = self._db(run=run)
                with self.assertRaises(SourcePreAnalysisInvalidRunStateError):
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        result=SourcePreAnalysisResultInput(), findings=[],
                        provenance=VALID_PROVENANCE,
                    )
                self.assertEqual(db.scalar.call_count, 1)
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_missing_deleted_or_cross_document_page_is_rejected(self) -> None:
        page_id = uuid.uuid4()
        cases = (
            ("missing", [], SourcePreAnalysisPageNotFoundError),
            ("soft-deleted", [], SourcePreAnalysisPageNotFoundError),
            (
                "cross-document",
                [SimpleNamespace(id=page_id, source_document_id=uuid.uuid4())],
                SourcePreAnalysisPageDocumentMismatchError,
            ),
        )
        for label, pages, error in cases:
            with self.subTest(label=label):
                db, run = self._db(pages=pages)
                with self.assertRaises(error):
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        result=SourcePreAnalysisResultInput(),
                        findings=[self._finding(page_id=page_id)],
                        provenance=VALID_PROVENANCE,
                    )
                db.add.assert_not_called()
                db.flush.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_invalid_result_values_are_rejected_before_database_access(self) -> None:
        invalid = (
            SourcePreAnalysisResultInput(schema_version=0),
            SourcePreAnalysisResultInput(schema_version=-1),
            SourcePreAnalysisResultInput(schema_version=True),
            SourcePreAnalysisResultInput(schema_version=1.5),  # type: ignore[arg-type]
            SourcePreAnalysisResultInput(page_count=-1),
            SourcePreAnalysisResultInput(page_count=True),
            SourcePreAnalysisResultInput(page_count=1.5),  # type: ignore[arg-type]
        )
        for result in invalid:
            with self.subTest(result=result):
                db = MagicMock()
                with self.assertRaises(SourcePreAnalysisValidationError):
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=uuid.uuid4(), execution_lease_id=LEASE_ID,
                        result=result, findings=[],
                        provenance=VALID_PROVENANCE,
                    )
                db.scalar.assert_not_called()
                db.add.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_invalid_findings_are_all_rejected_before_persistence(self) -> None:
        invalid = (
            self._finding(code=" "), self._finding(code="x" * 101),
            self._finding(code=7), self._finding(message="\t"),
            self._finding(message=7), self._finding(severity="warning"),
            self._finding(confidence=0.5), self._finding(confidence=1),
            self._finding(confidence=Decimal("-0.0001")),
            self._finding(confidence=Decimal("1.0001")),
            self._finding(confidence=Decimal("NaN")),
            self._finding(confidence=Decimal("Infinity")),
            self._finding(confidence=Decimal("-Infinity")),
        )
        for finding in invalid:
            with self.subTest(finding=finding):
                db = MagicMock()
                with self.assertRaises(SourcePreAnalysisValidationError):
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=uuid.uuid4(),
                        execution_lease_id=LEASE_ID,
                        result=SourcePreAnalysisResultInput(),
                        findings=[self._finding(code="valid"), finding],
                        provenance=VALID_PROVENANCE,
                    )
                db.scalar.assert_not_called()
                db.add.assert_not_called()
                db.flush.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_invalid_page_id_is_rejected_before_persistence(self) -> None:
        finding = self._finding()
        object.__setattr__(finding, "source_document_page_id", "not-a-uuid")
        db = MagicMock()
        with self.assertRaises(SourcePreAnalysisValidationError):
            SourcePreAnalysisService(db).finalize_success(
                run_id=uuid.uuid4(), execution_lease_id=LEASE_ID,
                result=SourcePreAnalysisResultInput(),
                findings=[finding],
                provenance=VALID_PROVENANCE,
            )
        db.scalar.assert_not_called()
        db.add.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_integrity_errors_from_flush_or_commit_are_translated(self) -> None:
        for method_name in ("flush", "commit"):
            with self.subTest(method_name=method_name):
                db, run = self._db()
                failure = IntegrityError(
                    "finalize", {}, Exception("persistence conflict"),
                )
                getattr(db, method_name).side_effect = failure
                with self.assertRaises(
                    SourcePreAnalysisPersistenceConflictError,
                ) as raised:
                    SourcePreAnalysisService(db).finalize_success(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        result=SourcePreAnalysisResultInput(), findings=[],
                        provenance=VALID_PROVENANCE,
                    )
                self.assertIs(raised.exception.__cause__, failure)
                db.rollback.assert_called_once_with()

    def test_unexpected_failure_rolls_back_and_does_not_touch_history(self) -> None:
        db, run = self._db()
        failure = RuntimeError("commit failed")
        db.commit.side_effect = failure
        old_result = SimpleNamespace(value="unchanged")
        old_finding = SimpleNamespace(value="unchanged")
        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).finalize_success(
                run_id=run.id, execution_lease_id=run.execution_lease_id,
                result=SourcePreAnalysisResultInput(), findings=[],
                provenance=VALID_PROVENANCE,
            )
        self.assertIs(raised.exception, failure)
        self.assertEqual((old_result.value, old_finding.value), (
            "unchanged", "unchanged",
        ))
        db.rollback.assert_called_once_with()

    def test_no_partial_or_historical_mutation_methods_are_exposed(self) -> None:
        for method_name in (
            "create_result", "add_finding", "append_finding", "update_result",
            "update_finding", "delete_result", "delete_finding",
        ):
            self.assertFalse(hasattr(SourcePreAnalysisService, method_name))


class SourcePreAnalysisServiceMarkFailedTest(unittest.TestCase):
    @staticmethod
    def _run(
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.RUNNING,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(), source_document_id=uuid.uuid4(), status=status,
            started_at=NOW, completed_at=None, failure_message=None,
            execution_lease_id=LEASE_ID, last_heartbeat_at=NOW,
        )

    @staticmethod
    def _db(
        *,
        run: SimpleNamespace | None = None,
        existing_result: object | None = None,
    ) -> tuple[MagicMock, SimpleNamespace]:
        db = MagicMock()
        selected_run = run or SourcePreAnalysisServiceMarkFailedTest._run()
        db.scalar.side_effect = [selected_run, existing_result]
        return db, selected_run

    def test_running_run_transitions_to_failed_with_normalized_message(self) -> None:
        db, run = self._db()
        started_at = run.started_at

        with patch(
            "app.services.source_pre_analysis_service.utc_now", return_value=NOW,
        ) as clock:
            returned = SourcePreAnalysisService(db).mark_failed(
                run_id=run.id,
                execution_lease_id=run.execution_lease_id,
                failure_message="  Source could not be processed safely.  ",
            )

        self.assertIs(returned, run)
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.FAILED)
        self.assertEqual(run.completed_at, NOW)
        self.assertEqual(run.started_at, started_at)
        self.assertEqual(
            run.failure_message, "Source could not be processed safely.",
        )
        self.assertIsNone(run.execution_lease_id)
        self.assertIsNone(run.last_heartbeat_at)
        clock.assert_called_once_with()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.flush.assert_not_called()

    def test_invalid_messages_are_rejected_before_database_access(self) -> None:
        for failure_message in ("", " \t\r\n ", RuntimeError("unsafe"), None):
            with self.subTest(failure_message=failure_message):
                db = MagicMock()

                with self.assertRaises(SourcePreAnalysisValidationError):
                    SourcePreAnalysisService(db).mark_failed(
                        run_id=uuid.uuid4(),
                        execution_lease_id=LEASE_ID,
                        failure_message=failure_message,  # type: ignore[arg-type]
                    )

                db.scalar.assert_not_called()
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_wrong_execution_lease_cannot_mark_failed(self) -> None:
        db, run = self._db()

        with self.assertRaises(SourcePreAnalysisLeaseMismatchError):
            SourcePreAnalysisService(db).mark_failed(
                run_id=run.id,
                execution_lease_id=uuid.uuid4(),
                failure_message="Safe summary.",
            )

        self.assertEqual(run.status, SourcePreAnalysisRunStatus.RUNNING)
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_non_running_states_are_rejected_without_mutation(self) -> None:
        for status in (
            SourcePreAnalysisRunStatus.PENDING,
            SourcePreAnalysisRunStatus.SUCCEEDED,
            SourcePreAnalysisRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                run = self._run(status)
                original = (
                    run.status, run.started_at, run.completed_at,
                    run.failure_message,
                )
                db, _ = self._db(run=run)

                with self.assertRaises(SourcePreAnalysisInvalidRunStateError):
                    SourcePreAnalysisService(db).mark_failed(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        failure_message="Safe failure summary.",
                    )

                self.assertEqual(
                    (run.status, run.started_at, run.completed_at,
                     run.failure_message),
                    original,
                )
                self.assertEqual(db.scalar.call_count, 1)
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_unavailable_run_or_document_is_not_found(self) -> None:
        for unavailable_state in (
            "missing run", "soft-deleted run", "missing document",
            "soft-deleted document",
        ):
            with self.subTest(unavailable_state=unavailable_state):
                db = MagicMock()
                db.scalar.return_value = None

                with self.assertRaises(SourcePreAnalysisRunNotFoundError):
                    SourcePreAnalysisService(db).mark_failed(
                        run_id=uuid.uuid4(), execution_lease_id=LEASE_ID,
                        failure_message="Safe summary.",
                    )

                query = str(db.scalar.call_args.args[0])
                self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", query)
                self.assertIn("source_documents.deleted_at IS NULL", query)
                self.assertIn("FOR UPDATE", query)
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_existing_result_including_deleted_history_blocks_failure(self) -> None:
        for deleted_at in (None, NOW):
            with self.subTest(deleted_at=deleted_at):
                existing_result = SimpleNamespace(
                    id=uuid.uuid4(), deleted_at=deleted_at, value="unchanged",
                )
                db, run = self._db(existing_result=existing_result)

                with self.assertRaises(SourcePreAnalysisResultAlreadyExistsError):
                    SourcePreAnalysisService(db).mark_failed(
                        run_id=run.id,
                        execution_lease_id=run.execution_lease_id,
                        failure_message="Safe summary.",
                    )

                self.assertEqual(existing_result.value, "unchanged")
                result_statement = db.scalar.call_args_list[1].args[0]
                self.assertNotIn(
                    "source_pre_analysis_results.deleted_at",
                    str(result_statement.whereclause),
                )
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_commit_integrity_error_is_translated_with_original_cause(self) -> None:
        db, run = self._db()
        failure = IntegrityError(
            "mark failed", {}, Exception("persistence conflict"),
        )
        db.commit.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisPersistenceConflictError,
        ) as raised:
            SourcePreAnalysisService(db).mark_failed(
                run_id=run.id, execution_lease_id=run.execution_lease_id,
                failure_message="Safe summary.",
            )

        self.assertIs(raised.exception.__cause__, failure)
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()

    def test_unexpected_database_error_rolls_back_and_propagates(self) -> None:
        db = MagicMock()
        failure = RuntimeError("query failed")
        db.scalar.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).mark_failed(
                run_id=uuid.uuid4(), execution_lease_id=LEASE_ID,
                failure_message="Safe summary.",
            )

        self.assertIs(raised.exception, failure)
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()
        db.add.assert_not_called()
        db.flush.assert_not_called()

    def test_no_historical_result_or_finding_mutation_methods_exist(self) -> None:
        for method_name in (
            "update_result", "update_finding", "delete_result",
            "delete_finding", "append_finding",
        ):
            self.assertFalse(hasattr(SourcePreAnalysisService, method_name))


class SourcePreAnalysisServiceCreateRunTest(unittest.TestCase):
    @staticmethod
    def _source() -> SimpleNamespace:
        return SimpleNamespace(id=uuid.uuid4())

    def test_first_run_without_requester_is_created_pending(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None, None]

        returned = SourcePreAnalysisService(db).create_run(
            source_document_id=source.id,
        )

        self.assertIsInstance(returned, SourcePreAnalysisRun)
        self.assertEqual(returned.source_document_id, source.id)
        self.assertEqual(returned.run_number, 1)
        self.assertEqual(returned.status, SourcePreAnalysisRunStatus.PENDING)
        self.assertIsNone(returned.requested_by_user_id)
        self.assertIsNone(returned.started_at)
        self.assertIsNone(returned.completed_at)
        self.assertIsNone(returned.failure_message)
        self.assertIs(db.add.call_args.args[0], returned)
        db.add.assert_called_once_with(returned)
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        self.assertEqual(db.scalar.call_count, 3)

    def test_source_lookup_is_active_scoped_and_locked(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None, None]

        SourcePreAnalysisService(db).create_run(source_document_id=source.id)

        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("source_documents.id", statement)
        self.assertIn("source_documents.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_valid_active_requester_is_required_and_persisted(self) -> None:
        db = MagicMock()
        source = self._source()
        requester_id = uuid.uuid4()
        user = SimpleNamespace(id=requester_id, is_active=True, deleted_at=None)
        db.scalar.side_effect = [source, user, None, None]

        returned = SourcePreAnalysisService(db).create_run(
            source_document_id=source.id,
            requested_by_user_id=requester_id,
        )

        self.assertEqual(returned.requested_by_user_id, requester_id)
        self.assertEqual(db.scalar.call_count, 4)
        user_statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("users.id", user_statement)
        self.assertIn("users.is_active IS true", user_statement)
        self.assertIn("users.deleted_at IS NULL", user_statement)
        self.assertNotIn("FOR UPDATE", user_statement)
        db.commit.assert_called_once_with()

    def test_unavailable_source_is_rejected(self) -> None:
        for state in ("missing", "soft-deleted"):
            with self.subTest(state=state):
                db = MagicMock()
                db.scalar.return_value = None

                with self.assertRaises(
                    SourcePreAnalysisSourceDocumentNotFoundError,
                ):
                    SourcePreAnalysisService(db).create_run(
                        source_document_id=uuid.uuid4(),
                    )

                statement = str(db.scalar.call_args.args[0])
                self.assertIn("source_documents.deleted_at IS NULL", statement)
                self.assertIn("FOR UPDATE", statement)
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_unavailable_requester_is_rejected(self) -> None:
        for state in ("missing", "inactive", "soft-deleted"):
            with self.subTest(state=state):
                db = MagicMock()
                source = self._source()
                db.scalar.side_effect = [source, None]

                with self.assertRaises(
                    SourcePreAnalysisRequestedByUserNotFoundError,
                ):
                    SourcePreAnalysisService(db).create_run(
                        source_document_id=source.id,
                        requested_by_user_id=uuid.uuid4(),
                    )

                user_statement = str(db.scalar.call_args_list[1].args[0])
                self.assertIn("users.is_active IS true", user_statement)
                self.assertIn("users.deleted_at IS NULL", user_statement)
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_invalid_ids_are_rejected_before_database_access(self) -> None:
        cases = (
            ("not-a-uuid", None),
            (1, None),
            (True, None),
            (uuid.uuid4(), "not-a-uuid"),
            (uuid.uuid4(), 1),
            (uuid.uuid4(), False),
        )
        for source_id, requester_id in cases:
            with self.subTest(
                source_id=source_id, requester_id=requester_id,
            ):
                db = MagicMock()
                with self.assertRaises(SourcePreAnalysisValidationError):
                    SourcePreAnalysisService(db).create_run(
                        source_document_id=source_id,  # type: ignore[arg-type]
                        requested_by_user_id=requester_id,  # type: ignore[arg-type]
                    )
                db.scalar.assert_not_called()
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_query_failure_rolls_back_and_propagates(self) -> None:
        db = MagicMock()
        failure = RuntimeError("source lookup failed")
        db.scalar.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=uuid.uuid4(),
            )

        self.assertIs(raised.exception, failure)
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_commit_integrity_error_is_translated_with_original_cause(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = IntegrityError("insert", {}, Exception("run conflict"))
        db.scalar.side_effect = [source, None, None]
        db.commit.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisPersistenceConflictError,
        ) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
            )

        self.assertIs(raised.exception.__cause__, failure)
        db.add.assert_called_once()
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()
        self.assertEqual(db.scalar.call_count, 3)

    def test_add_integrity_error_is_translated_with_original_cause(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = IntegrityError("insert", {}, Exception("run conflict"))
        db.scalar.side_effect = [source, None, None]
        db.add.side_effect = failure

        with self.assertRaises(
            SourcePreAnalysisPersistenceConflictError,
        ) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
            )

        self.assertIs(raised.exception.__cause__, failure)
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()
        self.assertEqual(db.scalar.call_count, 3)

    def test_requester_query_failure_rolls_back_unchanged(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = RuntimeError("requester lookup failed")
        db.scalar.side_effect = [source, failure]

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
                requested_by_user_id=uuid.uuid4(),
            )

        self.assertIs(raised.exception, failure)
        self.assertEqual(db.scalar.call_count, 2)
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_active_run_query_failure_rolls_back_before_max_or_add(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = RuntimeError("active run lookup failed")
        db.scalar.side_effect = [source, failure]

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
            )

        self.assertIs(raised.exception, failure)
        self.assertEqual(db.scalar.call_count, 2)
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_max_query_failure_rolls_back_before_add(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = RuntimeError("historical maximum lookup failed")
        db.scalar.side_effect = [source, None, failure]

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
            )

        self.assertIs(raised.exception, failure)
        self.assertEqual(db.scalar.call_count, 3)
        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_generic_commit_failure_rolls_back_and_propagates_unchanged(self) -> None:
        db = MagicMock()
        source = self._source()
        failure = RuntimeError("commit failed")
        db.scalar.side_effect = [source, None, 3]
        db.commit.side_effect = failure
        historical_run = SimpleNamespace(
            id=uuid.uuid4(), run_number=3, status=SourcePreAnalysisRunStatus.FAILED,
        )

        with self.assertRaises(RuntimeError) as raised:
            SourcePreAnalysisService(db).create_run(
                source_document_id=source.id,
            )

        self.assertIs(raised.exception, failure)
        self.assertEqual(
            (historical_run.run_number, historical_run.status),
            (3, SourcePreAnalysisRunStatus.FAILED),
        )
        db.add.assert_called_once()
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()

    def test_run_number_unique_constraint_remains_final_database_defense(self) -> None:
        uniques = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in SourcePreAnalysisRun.__table__.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            uniques.get("uq_source_pre_analysis_runs_document_number"),
            ("source_document_id", "run_number"),
        )

    def test_active_pending_or_running_run_blocks_creation(self) -> None:
        for status in (
            SourcePreAnalysisRunStatus.PENDING,
            SourcePreAnalysisRunStatus.RUNNING,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                source = self._source()
                active_run_id = uuid.uuid4()
                db.scalar.side_effect = [source, active_run_id]

                with self.assertRaises(SourcePreAnalysisActiveRunExistsError):
                    SourcePreAnalysisService(db).create_run(
                        source_document_id=source.id,
                    )

                active_statement = db.scalar.call_args_list[1].args[0]
                active_query = str(active_statement)
                self.assertIn(
                    "source_pre_analysis_runs.source_document_id", active_query,
                )
                self.assertIn(
                    "source_pre_analysis_runs.deleted_at IS NULL", active_query,
                )
                self.assertIn("source_pre_analysis_runs.status IN", active_query)
                compiled = active_statement.compile().params
                status_values = next(
                    value for value in compiled.values()
                    if isinstance(value, (list, tuple))
                )
                self.assertEqual(
                    tuple(status_values),
                    (
                        SourcePreAnalysisRunStatus.PENDING,
                        SourcePreAnalysisRunStatus.RUNNING,
                    ),
                )
                self.assertEqual(db.scalar.call_count, 2)
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_terminal_or_soft_deleted_history_allows_creation(self) -> None:
        for history in (
            "succeeded", "failed", "soft-deleted pending",
            "soft-deleted running",
        ):
            with self.subTest(history=history):
                db = MagicMock()
                source = self._source()
                db.scalar.side_effect = [source, None, 4]

                run = SourcePreAnalysisService(db).create_run(
                    source_document_id=source.id,
                )

                self.assertEqual(run.run_number, 5)
                db.add.assert_called_once_with(run)
                db.commit.assert_called_once_with()

    def test_historical_max_allocates_next_without_reusing_gaps(self) -> None:
        for maximum, expected, history in (
            (None, 1, "no history"),
            (1, 2, "failed history"),
            (7, 8, "succeeded history"),
            (11, 12, "soft-deleted history with gaps"),
        ):
            with self.subTest(maximum=maximum, history=history):
                db = MagicMock()
                source = self._source()
                db.scalar.side_effect = [source, None, maximum]

                run = SourcePreAnalysisService(db).create_run(
                    source_document_id=source.id,
                )

                self.assertEqual(run.run_number, expected)
                maximum_statement = db.scalar.call_args_list[2].args[0]
                maximum_query = str(maximum_statement)
                self.assertIn(
                    "max(source_pre_analysis_runs.run_number)", maximum_query,
                )
                self.assertIn(
                    "source_pre_analysis_runs.source_document_id", maximum_query,
                )
                self.assertNotIn(
                    "source_pre_analysis_runs.deleted_at",
                    str(maximum_statement.whereclause),
                )
                self.assertNotIn(
                    "source_pre_analysis_runs.status",
                    str(maximum_statement.whereclause),
                )

    def test_creation_query_and_write_order_is_locked_guarded_allocated(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None, 2]

        run = SourcePreAnalysisService(db).create_run(
            source_document_id=source.id,
        )

        self.assertEqual(run.run_number, 3)
        self.assertEqual(db.scalar.call_count, 3)
        source_query = str(db.scalar.call_args_list[0].args[0])
        active_query = str(db.scalar.call_args_list[1].args[0])
        maximum_query = str(db.scalar.call_args_list[2].args[0])
        self.assertIn("FOR UPDATE", source_query)
        self.assertNotIn("max(", active_query.lower())
        self.assertIn("max(", maximum_query.lower())
        names = [call[0] for call in db.method_calls]
        scalar_positions = [
            index for index, name in enumerate(names) if name == "scalar"
        ]
        self.assertEqual(len(scalar_positions), 3)
        self.assertLess(scalar_positions[2], names.index("add"))
        self.assertLess(names.index("add"), names.index("commit"))
        db.add.assert_called_once_with(run)
        db.flush.assert_not_called()
        db.commit.assert_called_once_with()

    def test_run_number_is_not_a_public_create_run_parameter(self) -> None:
        import inspect

        parameters = inspect.signature(
            SourcePreAnalysisService.create_run
        ).parameters
        self.assertNotIn("run_number", parameters)


if __name__ == "__main__":
    unittest.main()
