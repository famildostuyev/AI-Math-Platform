from __future__ import annotations

import os
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.exc import OperationalError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.services.question_extraction_output_service import (
    QuestionExtractionOutputPageError,
    QuestionExtractionOutputService,
    QuestionExtractionOutputSourceNotFoundError,
    QuestionExtractionOutputStructureError,
    QuestionExtractionOutputValidationError,
)
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorCandidate,
    QuestionExtractionProcessorResult,
)
from app.services.question_extraction_service import (
    QuestionExtractionCandidateInput,
)


class QuestionExtractionOutputServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.run_id = uuid.uuid4()
        self.document_id = uuid.uuid4()
        self.run = SimpleNamespace(
            id=self.run_id,
            source_document_id=self.document_id,
        )
        self.document = SimpleNamespace(id=self.document_id)

    @staticmethod
    def _candidate(
        *,
        page_number: int | None = 1,
        extracted_text: str = " Find x. ",
        confidence: Decimal | None = Decimal("0.75"),
    ) -> QuestionExtractionProcessorCandidate:
        return QuestionExtractionProcessorCandidate(
            page_number=page_number,
            extracted_text=extracted_text,
            confidence=confidence,
        )

    @classmethod
    def _result(
        cls,
        *,
        candidates: tuple[QuestionExtractionProcessorCandidate, ...] | None = None,
    ) -> QuestionExtractionProcessorResult:
        return QuestionExtractionProcessorResult(
            schema_version=1,
            candidates=(
                candidates if candidates is not None else (cls._candidate(),)
            ),
        )

    def _service(self) -> QuestionExtractionOutputService:
        return QuestionExtractionOutputService(self.db)

    def test_constructor_stores_session(self) -> None:
        service = self._service()
        self.assertIs(service.db, self.db)

    def test_maps_page_scoped_candidates_to_existing_page_ids(self) -> None:
        page_1_id = uuid.uuid4()
        page_2_id = uuid.uuid4()
        pages = [
            SimpleNamespace(
                id=page_1_id,
                source_document_id=self.document_id,
                page_number=1,
                deleted_at=None,
            ),
            SimpleNamespace(
                id=page_2_id,
                source_document_id=self.document_id,
                page_number=2,
                deleted_at=None,
            ),
        ]
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )
        self.db.scalars.return_value.all.return_value = pages
        result = self._result(
            candidates=(
                self._candidate(
                    page_number=2,
                    extracted_text=" Question B ",
                    confidence=None,
                ),
                self._candidate(
                    page_number=1,
                    extracted_text=" Question A ",
                    confidence=Decimal("0.9"),
                ),
            ),
        )

        mapped = self._service().prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=result,
        )

        self.assertEqual(
            mapped,
            (
                QuestionExtractionCandidateInput(
                    source_document_page_id=page_2_id,
                    extracted_text="Question B",
                    confidence=None,
                ),
                QuestionExtractionCandidateInput(
                    source_document_page_id=page_1_id,
                    extracted_text="Question A",
                    confidence=Decimal("0.9"),
                ),
            ),
        )
        self.db.add.assert_not_called()
        self.db.add_all.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()

    def test_page_less_candidate_maps_to_null_without_page_query(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        mapped = self._service().prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=self._result(
                candidates=(
                    self._candidate(
                        page_number=None,
                        extracted_text=" Document-level question ",
                        confidence=None,
                    ),
                )
            ),
        )

        self.assertEqual(
            mapped,
            (
                QuestionExtractionCandidateInput(
                    source_document_page_id=None,
                    extracted_text="Document-level question",
                    confidence=None,
                ),
            ),
        )
        self.db.scalars.assert_not_called()

    def test_empty_candidate_result_maps_to_empty_tuple(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        mapped = self._service().prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=self._result(candidates=()),
        )

        self.assertEqual(mapped, ())
        self.db.scalars.assert_not_called()

    def test_run_id_and_processor_result_are_validated_before_database_access(self) -> None:
        cases = (
            ("bad", self._result()),
            (1, self._result()),
            (True, self._result()),
            (None, self._result()),
            (uuid.uuid4(), "bad-result"),
        )

        for run_id, processor_result in cases:
            with self.subTest(
                run_id=run_id,
                processor_result=processor_result,
            ):
                db = MagicMock()
                service = QuestionExtractionOutputService(db)

                with self.assertRaises(
                    QuestionExtractionOutputValidationError
                ):
                    service.prepare_finalization_inputs(
                        run_id=run_id,  # type: ignore[arg-type]
                        processor_result=processor_result,  # type: ignore[arg-type]
                    )

                db.execute.assert_not_called()
                db.scalars.assert_not_called()

    def test_query_requires_active_run_and_source_document_without_lock(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        self._service().prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=self._result(candidates=()),
        )

        statement = self.db.execute.call_args.args[0]
        sql = str(statement)

        self.assertIn("question_extraction_runs.id", sql)
        self.assertIn(
            "question_extraction_runs.source_document_id",
            sql,
        )
        self.assertIn("JOIN source_documents", sql)
        self.assertIn(
            "question_extraction_runs.deleted_at IS NULL",
            sql,
        )
        self.assertIn("source_documents.deleted_at IS NULL", sql)
        self.assertNotIn("FOR UPDATE", sql)

        params = statement.compile().params
        self.assertIn(self.run_id, params.values())

    def test_missing_or_deleted_run_or_source_is_rejected(self) -> None:
        self.db.execute.return_value.first.return_value = None

        with self.assertRaises(
            QuestionExtractionOutputSourceNotFoundError
        ):
            self._service().prepare_finalization_inputs(
                run_id=self.run_id,
                processor_result=self._result(),
            )

        self.db.scalars.assert_not_called()

    def test_inconsistent_run_source_relationship_is_rejected(self) -> None:
        self.run.source_document_id = uuid.uuid4()
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        with self.assertRaises(
            QuestionExtractionOutputStructureError
        ):
            self._service().prepare_finalization_inputs(
                run_id=self.run_id,
                processor_result=self._result(),
            )

        self.db.scalars.assert_not_called()

    def test_referenced_page_must_exist_and_belong_to_source_document(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        cases = (
            [],
            [
                SimpleNamespace(
                    id=uuid.uuid4(),
                    source_document_id=uuid.uuid4(),
                    page_number=1,
                    deleted_at=None,
                )
            ],
        )

        for pages in cases:
            with self.subTest(pages=pages):
                self.db.scalars.reset_mock()
                self.db.scalars.return_value.all.return_value = pages

                with self.assertRaises(
                    QuestionExtractionOutputPageError
                ):
                    self._service().prepare_finalization_inputs(
                        run_id=self.run_id,
                        processor_result=self._result(),
                    )

    def test_soft_deleted_or_duplicate_page_history_is_rejected(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )

        page_id = uuid.uuid4()
        cases = (
            [
                SimpleNamespace(
                    id=page_id,
                    source_document_id=self.document_id,
                    page_number=1,
                    deleted_at=object(),
                )
            ],
            [
                SimpleNamespace(
                    id=uuid.uuid4(),
                    source_document_id=self.document_id,
                    page_number=1,
                    deleted_at=None,
                ),
                SimpleNamespace(
                    id=uuid.uuid4(),
                    source_document_id=self.document_id,
                    page_number=1,
                    deleted_at=None,
                ),
            ],
        )

        for pages in cases:
            with self.subTest(pages=pages):
                self.db.scalars.return_value.all.return_value = pages

                with self.assertRaises(
                    QuestionExtractionOutputStructureError
                ):
                    self._service().prepare_finalization_inputs(
                        run_id=self.run_id,
                        processor_result=self._result(),
                    )

    def test_database_failure_is_typed_without_transaction_mutation(self) -> None:
        failure = OperationalError(
            "SELECT secret",
            {},
            RuntimeError("database secret"),
        )
        self.db.execute.side_effect = failure

        with self.assertRaises(
            QuestionExtractionOutputSourceNotFoundError
        ) as raised:
            self._service().prepare_finalization_inputs(
                run_id=self.run_id,
                processor_result=self._result(),
            )

        self.assertNotIn("secret", str(raised.exception))
        self.assertIs(raised.exception.__cause__, failure)
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()

    def test_service_is_read_only_and_never_materializes_pages(self) -> None:
        self.db.execute.return_value.first.return_value = (
            self.run,
            self.document,
        )
        self.db.scalars.return_value.all.return_value = [
            SimpleNamespace(
                id=uuid.uuid4(),
                source_document_id=self.document_id,
                page_number=1,
                deleted_at=None,
            )
        ]

        self._service().prepare_finalization_inputs(
            run_id=self.run_id,
            processor_result=self._result(),
        )

        self.db.add.assert_not_called()
        self.db.add_all.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()

        module = Path(
            BACKEND_DIR
            / "app/services/question_extraction_output_service.py"
        ).read_text(encoding="utf-8")

        for forbidden in (
            "SourceDocumentPage(",
            "db.add(",
            "db.add_all(",
            "db.flush(",
            "db.commit(",
            "start_run",
            "finalize_success",
            "mark_failed",
            ".process(",
        ):
            self.assertNotIn(forbidden, module)


if __name__ == "__main__":
    unittest.main()
