from __future__ import annotations

import sys
import unittest
import uuid
from dataclasses import FrozenInstanceError, fields
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.services.source_pre_analysis_read_service import (
    SourcePreAnalysisFindingView,
    SourcePreAnalysisOverview,
    SourcePreAnalysisReadService,
    SourcePreAnalysisReadSourceNotFoundError,
    SourcePreAnalysisRunSummary,
    SourcePreAnalysisSuccessfulResultView,
)


NOW = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)


class SourcePreAnalysisReadServiceTest(unittest.TestCase):
    @staticmethod
    def _source() -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            question_source_id=uuid.uuid4(),
            uploaded_by_user_id=uuid.uuid4(),
        )

    @staticmethod
    def _run(status: SourcePreAnalysisRunStatus) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            run_number=7,
            status=status,
            requested_by_user_id=uuid.uuid4(),
            started_at=NOW,
            completed_at=NOW,
            failure_message="Safe failure summary."
            if status == SourcePreAnalysisRunStatus.FAILED else None,
        )

    @staticmethod
    def _result(
        *,
        schema_version: int = 1,
        page_count: int | None = None,
        processor_name: str | None = None,
        processor_version: str | None = None,
        provider_name: str | None = None,
        model_name: str | None = None,
        prompt_version: str | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            schema_version=schema_version,
            page_count=page_count,
            processor_name=processor_name,
            processor_version=processor_version,
            provider_name=provider_name,
            model_name=model_name,
            prompt_version=prompt_version,
        )

    @staticmethod
    def _finding(
        *,
        sequence_number: int,
        severity: SourcePreAnalysisFindingSeverity,
        source_document_page_id: uuid.UUID | None = None,
        confidence: Decimal | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            sequence_number=sequence_number,
            finding_code=f"finding_{sequence_number}",
            severity=severity,
            confidence=confidence,
            message=f"Finding {sequence_number}.",
            source_document_page_id=source_document_page_id,
        )

    @staticmethod
    def _set_successful_row(
        db: MagicMock,
        row: tuple[SimpleNamespace, SimpleNamespace] | None,
        finding_rows: list[tuple[SimpleNamespace, int | None]] | None = None,
    ) -> None:
        successful_query_result = MagicMock()
        successful_query_result.first.return_value = row
        query_results = [successful_query_result]
        if row is not None:
            finding_query_result = MagicMock()
            finding_query_result.all.return_value = finding_rows or []
            query_results.append(finding_query_result)
        db.execute.side_effect = query_results

    @staticmethod
    def _assert_read_only(db: MagicMock) -> None:
        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_not_called()

    def test_constructor_stores_session(self) -> None:
        db = MagicMock()

        service = SourcePreAnalysisReadService(db)

        self.assertIs(service.db, db)

    def test_active_source_without_runs_maps_overview_identity(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None]
        self._set_successful_row(db, None)

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        self.assertIsInstance(overview, SourcePreAnalysisOverview)
        self.assertEqual(overview.source_document_id, source.id)
        self.assertEqual(overview.media_asset_id, source.media_asset_id)
        self.assertEqual(overview.question_source_id, source.question_source_id)
        self.assertEqual(
            overview.uploaded_by_user_id, source.uploaded_by_user_id,
        )
        self.assertIsNone(overview.latest_run)
        self.assertIsNone(overview.latest_successful_result)
        self.assertEqual(db.scalar.call_count, 2)
        db.execute.assert_called_once()
        self._assert_read_only(db)

    def test_each_status_may_be_latest_and_maps_exact_run_fields(self) -> None:
        for status in SourcePreAnalysisRunStatus:
            with self.subTest(status=status):
                db = MagicMock()
                source = self._source()
                run = self._run(status)
                db.scalar.side_effect = [source, run]
                self._set_successful_row(db, None)

                overview = SourcePreAnalysisReadService(db).get_overview(
                    source_document_id=source.id,
                )

                self.assertEqual(
                    overview.latest_run,
                    SourcePreAnalysisRunSummary(
                        id=run.id,
                        run_number=run.run_number,
                        status=run.status,
                        requested_by_user_id=run.requested_by_user_id,
                        started_at=run.started_at,
                        completed_at=run.completed_at,
                        failure_message=run.failure_message,
                    ),
                )
                self.assertIsNone(overview.latest_successful_result)
                self._assert_read_only(db)

    def test_source_query_is_active_only_and_unlocked(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None]
        self._set_successful_row(db, None)

        SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        statement = str(db.scalar.call_args_list[0].args[0])
        self.assertIn("source_documents.id", statement)
        self.assertIn("source_documents.deleted_at IS NULL", statement)
        self.assertNotIn("FOR UPDATE", statement)

    def test_latest_run_query_is_active_ordered_limited_and_unlocked(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None]
        self._set_successful_row(db, None)

        SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        statement_object = db.scalar.call_args_list[1].args[0]
        statement = str(statement_object)
        self.assertIn("source_pre_analysis_runs.source_document_id", statement)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", statement)
        self.assertIn("source_pre_analysis_runs.run_number DESC", statement)
        self.assertIn("source_pre_analysis_runs.id DESC", statement)
        self.assertNotIn(
            "source_pre_analysis_runs.status",
            str(statement_object.whereclause),
        )
        self.assertNotIn("FOR UPDATE", statement)
        self.assertEqual(statement_object._limit_clause.value, 1)

    def test_missing_or_soft_deleted_source_is_not_found(self) -> None:
        for state in ("missing", "soft-deleted"):
            with self.subTest(state=state):
                db = MagicMock()
                db.scalar.return_value = None

                with self.assertRaises(
                    SourcePreAnalysisReadSourceNotFoundError,
                ):
                    SourcePreAnalysisReadService(db).get_overview(
                        source_document_id=uuid.uuid4(),
                    )

                self.assertEqual(db.scalar.call_count, 1)
                statement = str(db.scalar.call_args.args[0])
                self.assertIn("source_documents.deleted_at IS NULL", statement)
                self.assertNotIn("FOR UPDATE", statement)
                self._assert_read_only(db)

    def test_deleted_higher_run_is_excluded_by_query_not_relationships(self) -> None:
        db = MagicMock()
        source = self._source()
        active_run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
        db.scalar.side_effect = [source, active_run]
        self._set_successful_row(db, None)

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        self.assertEqual(overview.latest_run.id, active_run.id)
        run_statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", run_statement)
        self.assertEqual(db.scalar.call_count, 2)
        db.execute.assert_called_once()
        self._assert_read_only(db)

    def test_successful_result_maps_run_result_and_h2_placeholders(self) -> None:
        for page_count in (None, 0, 12):
            with self.subTest(page_count=page_count):
                db = MagicMock()
                source = self._source()
                latest_run = self._run(SourcePreAnalysisRunStatus.FAILED)
                successful_run = self._run(
                    SourcePreAnalysisRunStatus.SUCCEEDED,
                )
                successful_run.run_number = 4
                result = self._result(
                    schema_version=7,
                    page_count=page_count,
                    processor_name=" pdf-pre-analysis ",
                    processor_version=" 1.2.3 ",
                    provider_name=" provider-id ",
                    model_name=" model-id ",
                    prompt_version=" prompt-v4 ",
                )
                db.scalar.side_effect = [source, latest_run]
                self._set_successful_row(db, (successful_run, result))

                overview = SourcePreAnalysisReadService(db).get_overview(
                    source_document_id=source.id,
                )

                self.assertEqual(overview.latest_run.id, latest_run.id)
                view = overview.latest_successful_result
                self.assertIsNotNone(view)
                self.assertEqual(view.run.id, successful_run.id)
                self.assertEqual(view.run.run_number, 4)
                self.assertEqual(view.run.status, SourcePreAnalysisRunStatus.SUCCEEDED)
                self.assertEqual(view.result_id, result.id)
                self.assertEqual(view.schema_version, 7)
                self.assertEqual(view.page_count, page_count)
                self.assertEqual(view.processor_name, " pdf-pre-analysis ")
                self.assertEqual(view.processor_version, " 1.2.3 ")
                self.assertEqual(view.provider_name, " provider-id ")
                self.assertEqual(view.model_name, " model-id ")
                self.assertEqual(view.prompt_version, " prompt-v4 ")
                self.assertEqual(view.finding_count, 0)
                self.assertEqual(view.info_count, 0)
                self.assertEqual(view.warning_count, 0)
                self.assertEqual(view.error_count, 0)
                self.assertEqual(view.findings, ())
                self.assertEqual(db.scalar.call_count, 2)
                self.assertEqual(db.execute.call_count, 2)
                self._assert_read_only(db)

    def test_legacy_and_partial_provenance_are_preserved_exactly(self) -> None:
        cases = (
            (None, None, None),
            ("provider-only", None, None),
            (None, "model-only", None),
            (None, None, "prompt-only"),
        )
        for provider_name, model_name, prompt_version in cases:
            with self.subTest(
                provider_name=provider_name,
                model_name=model_name,
                prompt_version=prompt_version,
            ):
                db = MagicMock()
                source = self._source()
                latest_run = self._run(SourcePreAnalysisRunStatus.PENDING)
                latest_run.run_number = 9
                successful_run = self._run(
                    SourcePreAnalysisRunStatus.SUCCEEDED,
                )
                successful_run.run_number = 8
                result = self._result(
                    provider_name=provider_name,
                    model_name=model_name,
                    prompt_version=prompt_version,
                )
                db.scalar.side_effect = [source, latest_run]
                self._set_successful_row(db, (successful_run, result))

                overview = SourcePreAnalysisReadService(db).get_overview(
                    source_document_id=source.id,
                )

                view = overview.latest_successful_result
                self.assertIsNone(view.processor_name)
                self.assertIsNone(view.processor_version)
                self.assertEqual(view.provider_name, provider_name)
                self.assertEqual(view.model_name, model_name)
                self.assertEqual(view.prompt_version, prompt_version)
                self.assertEqual(overview.latest_run.id, latest_run.id)
                self.assertEqual(view.run.id, successful_run.id)
                self.assertEqual(db.scalar.call_count, 2)
                self.assertEqual(db.execute.call_count, 2)
                self._assert_read_only(db)

    def test_latest_success_query_has_exact_join_scope_order_and_limit(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None]
        self._set_successful_row(db, None)

        SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        statement_object = db.execute.call_args_list[0].args[0]
        statement = str(statement_object)
        whereclause = str(statement_object.whereclause)
        self.assertIn(
            "source_pre_analysis_results.source_pre_analysis_run_id = "
            "source_pre_analysis_runs.id",
            statement,
        )
        self.assertIn("source_pre_analysis_runs.source_document_id", whereclause)
        self.assertIn("source_pre_analysis_runs.status", whereclause)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", whereclause)
        self.assertIn("source_pre_analysis_results.deleted_at IS NULL", whereclause)
        self.assertIn("source_pre_analysis_runs.run_number DESC", statement)
        self.assertIn("source_pre_analysis_runs.id DESC", statement)
        self.assertEqual(statement_object._limit_clause.value, 1)
        self.assertNotIn("FOR UPDATE", statement)
        status_values = [
            value for value in statement_object.compile().params.values()
            if isinstance(value, SourcePreAnalysisRunStatus)
        ]
        self.assertEqual(status_values, [SourcePreAnalysisRunStatus.SUCCEEDED])

    def test_latest_run_and_successful_result_are_independent(self) -> None:
        for latest_status in (
            SourcePreAnalysisRunStatus.FAILED,
            SourcePreAnalysisRunStatus.RUNNING,
            SourcePreAnalysisRunStatus.PENDING,
        ):
            with self.subTest(latest_status=latest_status):
                db = MagicMock()
                source = self._source()
                latest_run = self._run(latest_status)
                latest_run.run_number = 9
                successful_run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
                successful_run.run_number = 8
                result = self._result(
                    processor_name="selected-processor",
                    processor_version="8",
                    provider_name="selected-provider",
                    model_name="selected-model",
                    prompt_version="selected-prompt",
                )
                db.scalar.side_effect = [source, latest_run]
                self._set_successful_row(db, (successful_run, result))

                overview = SourcePreAnalysisReadService(db).get_overview(
                    source_document_id=source.id,
                )

                self.assertEqual(overview.latest_run.id, latest_run.id)
                self.assertEqual(
                    overview.latest_successful_result.run.id,
                    successful_run.id,
                )
                self.assertEqual(
                    overview.latest_successful_result.processor_name,
                    "selected-processor",
                )
                self.assertEqual(
                    overview.latest_successful_result.processor_version,
                    "8",
                )
                self.assertEqual(
                    overview.latest_successful_result.provider_name,
                    "selected-provider",
                )
                self.assertEqual(
                    overview.latest_successful_result.model_name,
                    "selected-model",
                )
                self.assertEqual(
                    overview.latest_successful_result.prompt_version,
                    "selected-prompt",
                )

    def test_latest_succeeded_run_and_result_can_populate_both_fields(self) -> None:
        db = MagicMock()
        source = self._source()
        run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
        result = self._result()
        db.scalar.side_effect = [source, run]
        self._set_successful_row(db, (run, result))

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        self.assertEqual(overview.latest_run.id, run.id)
        self.assertEqual(overview.latest_successful_result.run.id, run.id)

    def test_soft_deleted_and_non_succeeded_results_are_excluded_by_query(self) -> None:
        db = MagicMock()
        source = self._source()
        db.scalar.side_effect = [source, None]
        self._set_successful_row(db, None)

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        self.assertIsNone(overview.latest_successful_result)
        statement = str(db.execute.call_args.args[0])
        self.assertIn("source_pre_analysis_runs.status", statement)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", statement)
        self.assertIn("source_pre_analysis_results.deleted_at IS NULL", statement)
        self.assertEqual(db.scalar.call_count, 2)
        db.execute.assert_called_once()
        self._assert_read_only(db)

    def test_findings_map_directly_with_pages_order_and_derived_counts(self) -> None:
        db = MagicMock()
        source = self._source()
        run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
        result = self._result(schema_version=3, page_count=5)
        page_id = uuid.uuid4()
        info = self._finding(
            sequence_number=1,
            severity=SourcePreAnalysisFindingSeverity.INFO,
            source_document_page_id=None,
            confidence=Decimal("0.1250"),
        )
        warning = self._finding(
            sequence_number=2,
            severity=SourcePreAnalysisFindingSeverity.WARNING,
            source_document_page_id=page_id,
            confidence=None,
        )
        error = self._finding(
            sequence_number=3,
            severity=SourcePreAnalysisFindingSeverity.ERROR,
            source_document_page_id=page_id,
            confidence=Decimal("1.0000"),
        )
        db.scalar.side_effect = [source, run]
        self._set_successful_row(
            db,
            (run, result),
            [(info, None), (warning, 4), (error, 4)],
        )

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        view = overview.latest_successful_result
        self.assertEqual(view.finding_count, len(view.findings))
        self.assertEqual(view.finding_count, 3)
        self.assertEqual(view.info_count, 1)
        self.assertEqual(view.warning_count, 1)
        self.assertEqual(view.error_count, 1)
        self.assertEqual(
            [finding.id for finding in view.findings],
            [info.id, warning.id, error.id],
        )
        self.assertEqual(view.findings[0].source_document_page_id, None)
        self.assertEqual(view.findings[0].page_number, None)
        self.assertEqual(view.findings[0].confidence, Decimal("0.1250"))
        self.assertEqual(view.findings[1].source_document_page_id, page_id)
        self.assertEqual(view.findings[1].page_number, 4)
        self.assertIsNone(view.findings[1].confidence)
        self.assertEqual(view.findings[1].finding_code, warning.finding_code)
        self.assertEqual(view.findings[1].severity, warning.severity)
        self.assertEqual(view.findings[1].message, warning.message)
        self.assertEqual(db.scalar.call_count, 2)
        self.assertEqual(db.execute.call_count, 2)
        self._assert_read_only(db)

    def test_unavailable_or_cross_source_page_retains_finding_page_identity(self) -> None:
        for state in ("soft-deleted", "cross-source"):
            with self.subTest(state=state):
                db = MagicMock()
                source = self._source()
                run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
                result = self._result()
                stored_page_id = uuid.uuid4()
                finding = self._finding(
                    sequence_number=1,
                    severity=SourcePreAnalysisFindingSeverity.INFO,
                    source_document_page_id=stored_page_id,
                )
                db.scalar.side_effect = [source, run]
                self._set_successful_row(
                    db, (run, result), [(finding, None)],
                )

                overview = SourcePreAnalysisReadService(db).get_overview(
                    source_document_id=source.id,
                )

                projected = overview.latest_successful_result.findings[0]
                self.assertEqual(
                    projected.source_document_page_id, stored_page_id,
                )
                self.assertIsNone(projected.page_number)

    def test_finding_query_uses_outer_join_active_scope_and_exact_order(self) -> None:
        db = MagicMock()
        source = self._source()
        run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
        result = self._result()
        db.scalar.side_effect = [source, run]
        self._set_successful_row(db, (run, result))

        SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        statement_object = db.execute.call_args_list[1].args[0]
        statement = str(statement_object)
        whereclause = str(statement_object.whereclause)
        self.assertIn("LEFT OUTER JOIN source_document_pages", statement)
        self.assertIn(
            "source_document_pages.id = "
            "source_pre_analysis_findings.source_document_page_id",
            statement,
        )
        self.assertIn("source_document_pages.deleted_at IS NULL", statement)
        self.assertIn("source_document_pages.source_document_id", statement)
        self.assertIn(
            "source_pre_analysis_findings.source_pre_analysis_result_id",
            whereclause,
        )
        self.assertIn(
            "source_pre_analysis_findings.deleted_at IS NULL", whereclause,
        )
        self.assertIn(
            "source_pre_analysis_findings.sequence_number ASC", statement,
        )
        self.assertIn("source_pre_analysis_findings.id ASC", statement)
        self.assertNotIn("FOR UPDATE", statement)

    def test_deleted_findings_are_excluded_and_cannot_affect_counts(self) -> None:
        db = MagicMock()
        source = self._source()
        run = self._run(SourcePreAnalysisRunStatus.SUCCEEDED)
        result = self._result()
        active = self._finding(
            sequence_number=1,
            severity=SourcePreAnalysisFindingSeverity.WARNING,
        )
        db.scalar.side_effect = [source, run]
        self._set_successful_row(db, (run, result), [(active, None)])

        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source.id,
        )

        view = overview.latest_successful_result
        self.assertEqual(view.finding_count, 1)
        self.assertEqual(view.info_count, 0)
        self.assertEqual(view.warning_count, 1)
        self.assertEqual(view.error_count, 0)
        finding_statement = str(db.execute.call_args_list[1].args[0])
        self.assertIn(
            "source_pre_analysis_findings.deleted_at IS NULL",
            finding_statement,
        )
        self.assertEqual(db.execute.call_count, 2)

    def test_all_internal_dtos_are_frozen_and_slotted(self) -> None:
        run = SourcePreAnalysisRunSummary(
            id=uuid.uuid4(), run_number=1,
            status=SourcePreAnalysisRunStatus.SUCCEEDED,
            requested_by_user_id=None, started_at=NOW, completed_at=NOW,
            failure_message=None,
        )
        finding = SourcePreAnalysisFindingView(
            id=uuid.uuid4(), sequence_number=1, finding_code="formula_present",
            severity=SourcePreAnalysisFindingSeverity.INFO,
            confidence=Decimal("1"), message="Formula present.",
            source_document_page_id=None, page_number=None,
        )
        successful = SourcePreAnalysisSuccessfulResultView(
            run=run, result_id=uuid.uuid4(), schema_version=1, page_count=None,
            processor_name=None, processor_version=None, provider_name=None,
            model_name=None, prompt_version=None,
            finding_count=1, info_count=1, warning_count=0, error_count=0,
            findings=(finding,),
        )
        overview = SourcePreAnalysisOverview(
            source_document_id=uuid.uuid4(), media_asset_id=uuid.uuid4(),
            question_source_id=None, uploaded_by_user_id=None,
            latest_run=run, latest_successful_result=successful,
        )

        for value in (run, finding, successful, overview):
            self.assertTrue(value.__dataclass_params__.frozen)
            self.assertFalse(hasattr(value, "__dict__"))
            self.assertGreater(len(fields(value)), 0)
            with self.assertRaises(FrozenInstanceError):
                value.id = uuid.uuid4()  # type: ignore[attr-defined,misc]


if __name__ == "__main__":
    unittest.main()
