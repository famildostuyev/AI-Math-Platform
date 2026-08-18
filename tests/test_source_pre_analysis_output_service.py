from __future__ import annotations

import os
import sys
import unittest
import uuid
from dataclasses import FrozenInstanceError
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.models.source_document_page import SourceDocumentPage
from app.services.source_pre_analysis_output_service import (
    DOCX_MIME_TYPE,
    SourcePreAnalysisFindingPageError,
    SourcePreAnalysisOutputService,
    SourcePreAnalysisOutputSourceNotFoundError,
    SourcePreAnalysisOutputUnsupportedMimeError,
    SourcePreAnalysisOutputValidationError,
    SourcePreAnalysisPageCountError,
    SourcePreAnalysisPagePersistenceConflictError,
    SourcePreAnalysisPageStructureError,
    SourcePreAnalysisPreparedOutput,
)
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorFinding,
    SourcePreAnalysisProcessorResult,
    SourcePreAnalysisProcessorResultError,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisFindingInput,
    SourcePreAnalysisResultInput,
)


NOW = datetime(2026, 8, 18, tzinfo=timezone.utc)


class SourcePreAnalysisOutputServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.run_id = uuid.uuid4()
        self.document_id = uuid.uuid4()
        self.media_id = uuid.uuid4()
        self.run = SimpleNamespace(
            id=self.run_id, source_document_id=self.document_id,
        )
        self.document = SimpleNamespace(
            id=self.document_id, media_asset_id=self.media_id,
        )
        self.media = SimpleNamespace(
            id=self.media_id, mime_type="application/pdf",
        )
        self.db.execute.return_value.first.return_value = (
            self.run, self.document, self.media,
        )
        self.db.scalars.return_value.all.return_value = []

        def assign_ids() -> None:
            for call in self.db.add.call_args_list:
                page = call.args[0]
                if page.id is None:
                    page.id = uuid.uuid4()

        self.db.flush.side_effect = assign_ids

    @staticmethod
    def _finding(
        page_number: int | None = None,
        *,
        code: str = " formula_present ",
        message: str = " Formula detected. ",
    ) -> SourcePreAnalysisProcessorFinding:
        return SourcePreAnalysisProcessorFinding(
            page_number=page_number,
            finding_code=code,
            severity=SourcePreAnalysisFindingSeverity.INFO,
            confidence=Decimal("0.75"),
            message=message,
        )

    @classmethod
    def _result(
        cls,
        page_count: int | None = 1,
        findings: tuple[SourcePreAnalysisProcessorFinding, ...] | None = None,
    ) -> SourcePreAnalysisProcessorResult:
        return SourcePreAnalysisProcessorResult(
            schema_version=1,
            page_count=page_count,
            findings=findings if findings is not None else (),
        )

    def _page(
        self,
        number: int,
        *,
        deleted: bool = False,
        page_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=page_id or uuid.uuid4(),
            source_document_id=self.document_id,
            page_number=number,
            deleted_at=NOW if deleted else None,
        )

    def _prepare(
        self,
        result: SourcePreAnalysisProcessorResult | None = None,
    ) -> SourcePreAnalysisPreparedOutput:
        return SourcePreAnalysisOutputService(
            self.db
        ).prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=result or self._result(),
        )

    def test_constructor_and_prepared_output_are_exact_immutable_contracts(self) -> None:
        service = SourcePreAnalysisOutputService(self.db)
        self.assertIs(service.db, self.db)
        prepared = SourcePreAnalysisPreparedOutput(
            result=SourcePreAnalysisResultInput(schema_version=1, page_count=None),
            findings=(),
        )
        self.assertFalse(hasattr(prepared, "__dict__"))
        with self.assertRaises(FrozenInstanceError):
            prepared.findings = ()  # type: ignore[misc]

    def test_strict_run_uuid_fails_before_processor_validation_or_database(self) -> None:
        for run_id in ("bad", 1, True, None):
            with self.subTest(run_id=run_id), patch(
                "app.services.source_pre_analysis_output_service."
                "validate_processor_result"
            ) as validator, self.assertRaises(
                SourcePreAnalysisOutputValidationError
            ):
                SourcePreAnalysisOutputService(
                    self.db
                ).prepare_finalization_inputs(
                    run_id=run_id,  # type: ignore[arg-type]
                    processor_result=self._result(),
                )
            validator.assert_not_called()
        self.db.execute.assert_not_called()
        self.db.rollback.assert_called()

    def test_k1_validation_is_reused_and_normalization_is_mapped(self) -> None:
        original = self._result(
            findings=(self._finding(None),),
        )
        prepared = self._prepare(original)
        self.assertEqual(original.findings[0].finding_code, " formula_present ")
        self.assertEqual(prepared.findings[0].finding_code, "formula_present")
        self.assertEqual(prepared.findings[0].message, "Formula detected.")
        self.assertIsInstance(prepared.result, SourcePreAnalysisResultInput)
        self.assertIsInstance(prepared.findings[0], SourcePreAnalysisFindingInput)

    def test_k1_validation_error_propagates_unchanged_before_database(self) -> None:
        failure = SourcePreAnalysisProcessorResultError("invalid")
        with patch(
            "app.services.source_pre_analysis_output_service."
            "validate_processor_result",
            side_effect=failure,
        ), self.assertRaises(SourcePreAnalysisProcessorResultError) as raised:
            self._prepare()
        self.assertIs(raised.exception, failure)
        self.db.execute.assert_not_called()
        self.db.rollback.assert_called_once_with()

    def test_source_query_is_active_joined_authoritative_and_document_locked(self) -> None:
        self._prepare()
        statement = self.db.execute.call_args.args[0]
        sql = str(statement)
        self.assertIn("source_pre_analysis_runs.id", sql)
        self.assertIn("JOIN source_documents", sql)
        self.assertIn("JOIN media_assets", sql)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", sql)
        self.assertIn("source_documents.deleted_at IS NULL", sql)
        self.assertIn("media_assets.deleted_at IS NULL", sql)
        self.assertIn("FOR UPDATE", sql)
        self.assertIn(self.run_id, statement.compile().params.values())
        page_statement = self.db.scalars.call_args.args[0]
        page_sql = str(page_statement)
        self.assertIn("source_document_pages.source_document_id", page_sql)
        self.assertNotIn("deleted_at IS NULL", page_sql)
        self.assertIn("FOR UPDATE", page_sql)

    def test_missing_context_and_relationship_mismatch_are_typed(self) -> None:
        self.db.execute.return_value.first.return_value = None
        with self.assertRaises(SourcePreAnalysisOutputSourceNotFoundError):
            self._prepare()
        self.db.rollback.assert_called_once_with()
        self.db.scalars.assert_not_called()

        for run_document_id, document_media_id in (
            (uuid.uuid4(), self.media_id),
            (self.document_id, uuid.uuid4()),
        ):
            with self.subTest(ids=(run_document_id, document_media_id)):
                self.db.reset_mock()
                self.run.source_document_id = run_document_id
                self.document.media_asset_id = document_media_id
                self.db.execute.return_value.first.return_value = (
                    self.run, self.document, self.media,
                )
                with self.assertRaises(SourcePreAnalysisPageStructureError):
                    self._prepare()
                self.db.scalars.assert_not_called()
                self.run.source_document_id = self.document_id
                self.document.media_asset_id = self.media_id

    def test_persisted_mime_is_authoritative_and_unsupported_is_rejected(self) -> None:
        self.media.mime_type = "application/unsupported"
        with self.assertRaises(SourcePreAnalysisOutputUnsupportedMimeError):
            self._prepare()
        self.db.scalars.assert_not_called()
        self.db.add.assert_not_called()

    def test_pdf_creates_complete_range_maps_findings_and_commits_once(self) -> None:
        result = self._result(3, (
            self._finding(None, code=" source ", message=" Source level. "),
            self._finding(3, code=" page ", message=" Page level. "),
        ))
        prepared = self._prepare(result)
        pages = [call.args[0] for call in self.db.add.call_args_list]
        self.assertEqual([page.page_number for page in pages], [1, 2, 3])
        self.assertTrue(all(isinstance(page, SourceDocumentPage) for page in pages))
        self.assertTrue(all(page.source_document_id == self.document_id for page in pages))
        self.assertIsNone(prepared.findings[0].source_document_page_id)
        self.assertEqual(prepared.findings[1].source_document_page_id, pages[2].id)
        self.assertEqual(
            [finding.finding_code for finding in prepared.findings],
            ["source", "page"],
        )
        self.assertEqual(prepared.result.schema_version, 1)
        self.assertEqual(prepared.result.page_count, 3)
        self.db.flush.assert_called_once_with()
        self.db.commit.assert_called_once_with()
        self.db.rollback.assert_not_called()

    def test_pdf_complete_range_reuses_ids_without_add_or_flush(self) -> None:
        page_ids = [uuid.uuid4(), uuid.uuid4()]
        pages = [self._page(1, page_id=page_ids[0]), self._page(2, page_id=page_ids[1])]
        self.db.scalars.return_value.all.return_value = pages
        prepared = self._prepare(self._result(2, (self._finding(2),)))
        self.assertEqual(prepared.findings[0].source_document_page_id, page_ids[1])
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_called_once_with()
        self.assertEqual([page.page_number for page in pages], [1, 2])

    def test_pdf_contiguous_prefix_is_extended_without_mutating_existing(self) -> None:
        existing_id = uuid.uuid4()
        existing = self._page(1, page_id=existing_id)
        self.db.scalars.return_value.all.return_value = [existing]
        prepared = self._prepare(self._result(3, (
            self._finding(1), self._finding(3),
        )))
        new_pages = [call.args[0] for call in self.db.add.call_args_list]
        self.assertEqual([page.page_number for page in new_pages], [2, 3])
        self.assertEqual(prepared.findings[0].source_document_page_id, existing_id)
        self.assertEqual(prepared.findings[1].source_document_page_id, new_pages[1].id)
        self.assertEqual(existing.id, existing_id)
        self.assertEqual(existing.page_number, 1)
        self.assertIsNone(existing.deleted_at)
        self.db.flush.assert_called_once_with()

    def test_pdf_invalid_counts_and_finding_reference_are_rejected(self) -> None:
        for count in (None, 0):
            with self.subTest(count=count), self.assertRaises(
                SourcePreAnalysisPageCountError
            ):
                self._prepare(self._result(count))
            self.db.reset_mock()
            self.db.execute.return_value.first.return_value = (
                self.run, self.document, self.media,
            )
        with self.assertRaises(SourcePreAnalysisFindingPageError):
            self._prepare(self._result(2, (self._finding(3),)))

    def test_pdf_invalid_historical_structures_are_rejected_without_mutation(self) -> None:
        cases = (
            [self._page(1), self._page(3)],
            [self._page(1), self._page(1)],
            [self._page(0)],
            [self._page(-1)],
            [self._page(1), self._page(2), self._page(3)],
            [self._page(1, deleted=True)],
        )
        for pages in cases:
            with self.subTest(numbers=[p.page_number for p in pages]):
                self.db.reset_mock()
                self.db.execute.return_value.first.return_value = (
                    self.run, self.document, self.media,
                )
                self.db.scalars.return_value.all.return_value = pages
                with self.assertRaises(SourcePreAnalysisPageStructureError):
                    self._prepare(self._result(2))
                self.db.add.assert_not_called()
                self.db.flush.assert_not_called()
                self.db.commit.assert_not_called()
                self.db.rollback.assert_called_once_with()

    def test_each_image_mime_creates_or_reuses_only_page_one(self) -> None:
        for mime_type in ("image/png", "image/jpeg", "image/webp"):
            with self.subTest(mime_type=mime_type):
                self.db.reset_mock()
                self.media.mime_type = mime_type
                self.db.execute.return_value.first.return_value = (
                    self.run, self.document, self.media,
                )
                self.db.scalars.return_value.all.return_value = []
                self.db.flush.side_effect = lambda: [
                    setattr(call.args[0], "id", uuid.uuid4())
                    for call in self.db.add.call_args_list
                ]
                prepared = self._prepare(self._result(1, (
                    self._finding(None), self._finding(1),
                )))
                page = self.db.add.call_args.args[0]
                self.assertEqual(page.page_number, 1)
                self.assertIsNone(prepared.findings[0].source_document_page_id)
                self.assertEqual(prepared.findings[1].source_document_page_id, page.id)
                self.db.flush.assert_called_once_with()
                self.db.commit.assert_called_once_with()

    def test_image_invalid_counts_references_and_history_are_rejected(self) -> None:
        self.media.mime_type = "image/png"
        for count in (None, 0, 2):
            with self.subTest(count=count), self.assertRaises(
                SourcePreAnalysisPageCountError
            ):
                self._prepare(self._result(count))
            self.db.reset_mock()
            self.db.execute.return_value.first.return_value = (
                self.run, self.document, self.media,
            )
        with self.assertRaises(SourcePreAnalysisFindingPageError):
            self._prepare(self._result(1, (self._finding(2),)))
        for page in (self._page(2), self._page(1, deleted=True)):
            self.db.reset_mock()
            self.db.execute.return_value.first.return_value = (
                self.run, self.document, self.media,
            )
            self.db.scalars.return_value.all.return_value = [page]
            with self.assertRaises(SourcePreAnalysisPageStructureError):
                self._prepare(self._result(1))

    def test_image_existing_page_one_is_reused_without_add_or_flush(self) -> None:
        self.media.mime_type = "image/jpeg"
        page_id = uuid.uuid4()
        page = self._page(1, page_id=page_id)
        self.db.scalars.return_value.all.return_value = [page]
        prepared = self._prepare(self._result(1, (self._finding(1),)))
        self.assertEqual(prepared.findings[0].source_document_page_id, page_id)
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_called_once_with()

    def test_docx_accepts_only_document_level_null_page_output(self) -> None:
        self.media.mime_type = DOCX_MIME_TYPE
        prepared = self._prepare(self._result(None, (self._finding(None),)))
        self.assertIsNone(prepared.result.page_count)
        self.assertIsNone(prepared.findings[0].source_document_page_id)
        self.db.add.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_called_once_with()

    def test_docx_rejects_count_page_findings_and_all_existing_page_history(self) -> None:
        self.media.mime_type = DOCX_MIME_TYPE
        for count in (0, 1):
            with self.subTest(count=count), self.assertRaises(
                SourcePreAnalysisPageCountError
            ):
                self._prepare(self._result(count))
            self.db.reset_mock()
            self.db.execute.return_value.first.return_value = (
                self.run, self.document, self.media,
            )
        with self.assertRaises(SourcePreAnalysisFindingPageError):
            self._prepare(self._result(None, (self._finding(1),)))
        for page in (self._page(1), self._page(1, deleted=True)):
            self.db.reset_mock()
            self.db.execute.return_value.first.return_value = (
                self.run, self.document, self.media,
            )
            self.db.scalars.return_value.all.return_value = [page]
            with self.assertRaises(SourcePreAnalysisPageStructureError):
                self._prepare(self._result(None))

    def test_integrity_errors_from_add_flush_or_commit_are_translated_with_cause(self) -> None:
        for method_name in ("add", "flush", "commit"):
            with self.subTest(method_name=method_name):
                self.setUp()
                failure = IntegrityError("write", {}, RuntimeError("conflict"))
                getattr(self.db, method_name).side_effect = failure
                with self.assertRaises(
                    SourcePreAnalysisPagePersistenceConflictError
                ) as raised:
                    self._prepare()
                self.assertIs(raised.exception.__cause__, failure)
                self.db.rollback.assert_called_once_with()
                self.assertEqual(getattr(self.db, method_name).call_count, 1)

    def test_generic_query_failure_rolls_back_and_propagates_without_retry(self) -> None:
        failure = RuntimeError("query failed")
        self.db.execute.side_effect = failure
        with self.assertRaises(RuntimeError) as raised:
            self._prepare()
        self.assertIs(raised.exception, failure)
        self.db.execute.assert_called_once()
        self.db.rollback.assert_called_once_with()
        self.db.commit.assert_not_called()

    def test_boundary_has_no_lifecycle_processor_result_persistence_or_candidates(self) -> None:
        module = Path(
            BACKEND_DIR / "app/services/source_pre_analysis_output_service.py"
        ).read_text(encoding="utf-8")
        for forbidden in (
            "start_run", "finalize_success", "mark_failed", "execute_run",
            ".process(", "SourcePreAnalysisResult(",
            "SourcePreAnalysisFinding(", "sequence_number",
            "QuestionFamily", "QuestionForm", "QuestionRevision",
            "APIRouter", "HTTPException",
        ):
            self.assertNotIn(forbidden, module)


if __name__ == "__main__":
    unittest.main()
