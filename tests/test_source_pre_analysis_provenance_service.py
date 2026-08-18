from __future__ import annotations

import inspect
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import SourcePreAnalysisRunStatus
from app.models.source_pre_analysis_result import SourcePreAnalysisResult
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorProvenance,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisPersistenceConflictError,
    SourcePreAnalysisResultInput,
    SourcePreAnalysisService,
    SourcePreAnalysisValidationError,
)


class SourcePreAnalysisProvenanceFinalizationTest(unittest.TestCase):
    @staticmethod
    def _run() -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(), source_document_id=uuid.uuid4(),
            status=SourcePreAnalysisRunStatus.RUNNING,
            started_at=object(), completed_at=None, failure_message=None,
        )

    def _db(self) -> tuple[MagicMock, SimpleNamespace]:
        db = MagicMock()
        run = self._run()
        db.scalar.side_effect = [run, None]

        def assign_id() -> None:
            db.add.call_args.args[0].id = uuid.uuid4()

        db.flush.side_effect = assign_id
        return db, run

    @staticmethod
    def _provenance(**changes: object) -> SourcePreAnalysisProcessorProvenance:
        values = {
            "processor_name": " test-processor ",
            "processor_version": " v1+build.2 ",
            "provider_name": None,
            "model_name": None,
            "prompt_version": None,
        }
        values.update(changes)
        return SourcePreAnalysisProcessorProvenance(**values)  # type: ignore[arg-type]

    def _finalize(
        self,
        db: MagicMock,
        run: SimpleNamespace,
        provenance: SourcePreAnalysisProcessorProvenance,
    ):
        return SourcePreAnalysisService(db).finalize_success(
            run_id=run.id,
            result=SourcePreAnalysisResultInput(schema_version=2, page_count=None),
            findings=[],
            provenance=provenance,
        )

    def test_provenance_is_required_by_signature_without_default(self) -> None:
        parameter = inspect.signature(
            SourcePreAnalysisService.finalize_success
        ).parameters["provenance"]
        self.assertIs(parameter.default, inspect.Parameter.empty)
        self.assertEqual(
            parameter.annotation, "SourcePreAnalysisProcessorProvenance",
        )

    def test_deterministic_provenance_is_normalized_on_same_result_insert(self) -> None:
        db, run = self._db()
        supplied = self._provenance()
        finalized = self._finalize(db, run, supplied)
        result = finalized.result
        self.assertIsInstance(result, SourcePreAnalysisResult)
        self.assertEqual(result.processor_name, "test-processor")
        self.assertEqual(result.processor_version, "v1+build.2")
        self.assertIsNone(result.provider_name)
        self.assertIsNone(result.model_name)
        self.assertIsNone(result.prompt_version)
        self.assertEqual(supplied.processor_name, " test-processor ")
        self.assertIs(db.add.call_args.args[0], result)
        db.add.assert_called_once_with(result)
        db.flush.assert_called_once_with()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        self.assertEqual(run.status, SourcePreAnalysisRunStatus.SUCCEEDED)

    def test_each_optional_combination_is_independently_accepted(self) -> None:
        cases = (
            {"provider_name": " openai "},
            {"model_name": " local/model:v1 "},
            {"prompt_version": " prompt-v2 "},
            {"provider_name": " local-ai ", "model_name": " Model/X ",
             "prompt_version": " config.3 "},
        )
        for optional in cases:
            with self.subTest(optional=optional):
                db, run = self._db()
                finalized = self._finalize(db, run, self._provenance(**optional))
                for field_name, value in optional.items():
                    self.assertEqual(
                        getattr(finalized.result, field_name), value.strip(),
                    )
                db.add.assert_called_once()
                db.commit.assert_called_once_with()

    def test_invalid_provenance_is_rejected_before_database_or_run_mutation(self) -> None:
        cases = (
            "not-provenance",
            self._provenance(processor_name=""),
            self._provenance(processor_name="BAD"),
            self._provenance(processor_name="x" * 101),
            self._provenance(processor_version=""),
            self._provenance(processor_version="x" * 101),
            self._provenance(provider_name=""),
            self._provenance(provider_name="Bad Provider"),
            self._provenance(model_name=""),
            self._provenance(model_name="x" * 201),
            self._provenance(prompt_version=""),
            self._provenance(prompt_version="x" * 101),
            self._provenance(prompt_version="actual prompt text"),
        )
        for provenance in cases:
            with self.subTest(provenance=provenance):
                db = MagicMock()
                run = self._run()
                original = (
                    run.status, run.started_at, run.completed_at,
                    run.failure_message,
                )
                with self.assertRaises(SourcePreAnalysisValidationError):
                    self._finalize(db, run, provenance)  # type: ignore[arg-type]
                self.assertEqual(
                    (run.status, run.started_at, run.completed_at,
                     run.failure_message),
                    original,
                )
                db.scalar.assert_not_called()
                db.scalars.assert_not_called()
                db.add.assert_not_called()
                db.add_all.assert_not_called()
                db.flush.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_finalize_integrity_error_keeps_atomic_translation_and_one_commit(self) -> None:
        db, run = self._db()
        failure = IntegrityError("insert", {}, RuntimeError("conflict"))
        db.commit.side_effect = failure
        with self.assertRaises(
            SourcePreAnalysisPersistenceConflictError
        ) as raised:
            self._finalize(db, run, self._provenance())
        self.assertIs(raised.exception.__cause__, failure)
        db.add.assert_called_once()
        db.flush.assert_called_once_with()
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()

    def test_generic_failure_rolls_back_without_second_provenance_transaction(self) -> None:
        db, run = self._db()
        failure = RuntimeError("commit failed")
        db.commit.side_effect = failure
        with self.assertRaises(RuntimeError) as raised:
            self._finalize(db, run, self._provenance())
        self.assertIs(raised.exception, failure)
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()

    def test_no_provenance_or_history_mutation_methods_exist(self) -> None:
        for method_name in (
            "update_provenance", "replace_provenance", "patch_provenance",
            "backfill_provenance", "update_result",
        ):
            self.assertFalse(hasattr(SourcePreAnalysisService, method_name))


if __name__ == "__main__":
    unittest.main()
