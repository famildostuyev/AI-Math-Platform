from __future__ import annotations

import json
import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.schemas import source_pre_analysis as schema_module
from app.schemas.source_pre_analysis import (
    SourcePreAnalysisFindingRead,
    SourcePreAnalysisOverviewRead,
    SourcePreAnalysisRunRead,
    SourcePreAnalysisSuccessfulResultRead,
)


NOW = datetime(2026, 8, 18, 16, 0, tzinfo=timezone.utc)


class SourcePreAnalysisSchemaTest(unittest.TestCase):
    @staticmethod
    def _run(
        *,
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.SUCCEEDED,
        run_number: int = 4,
    ) -> SourcePreAnalysisRunRead:
        return SourcePreAnalysisRunRead(
            id=uuid.uuid4(),
            source_document_id=uuid.uuid4(),
            run_number=run_number,
            status=status,
            requested_by_user_id=uuid.uuid4(),
            started_at=NOW,
            completed_at=NOW,
            failure_message=None,
        )

    @staticmethod
    def _finding(
        *,
        severity: SourcePreAnalysisFindingSeverity = (
            SourcePreAnalysisFindingSeverity.INFO
        ),
        confidence: Decimal | None = Decimal("0.8750"),
        page_id: uuid.UUID | None = None,
        page_number: int | None = None,
    ) -> SourcePreAnalysisFindingRead:
        return SourcePreAnalysisFindingRead(
            id=uuid.uuid4(),
            sequence_number=1,
            finding_code="formula_present",
            severity=severity,
            confidence=confidence,
            message="Formula detected.",
            source_document_page_id=page_id,
            page_number=page_number,
        )

    @classmethod
    def _successful(
        cls,
        *,
        run: SourcePreAnalysisRunRead | None = None,
        findings: list[SourcePreAnalysisFindingRead] | None = None,
        page_count: int | None = None,
    ) -> SourcePreAnalysisSuccessfulResultRead:
        items = findings or []
        return SourcePreAnalysisSuccessfulResultRead(
            run=run or cls._run(),
            result_id=uuid.uuid4(),
            schema_version=1,
            page_count=page_count,
            finding_count=len(items),
            info_count=sum(
                item.severity == SourcePreAnalysisFindingSeverity.INFO
                for item in items
            ),
            warning_count=sum(
                item.severity == SourcePreAnalysisFindingSeverity.WARNING
                for item in items
            ),
            error_count=sum(
                item.severity == SourcePreAnalysisFindingSeverity.ERROR
                for item in items
            ),
            findings=items,
        )

    def test_exact_public_model_names_and_field_inventories(self) -> None:
        expected = {
            "SourcePreAnalysisRunRead": {
                "id", "source_document_id", "run_number", "status",
                "requested_by_user_id", "started_at", "completed_at",
                "failure_message",
            },
            "SourcePreAnalysisFindingRead": {
                "id", "sequence_number", "finding_code", "severity",
                "confidence", "message", "source_document_page_id",
                "page_number",
            },
            "SourcePreAnalysisSuccessfulResultRead": {
                "run", "result_id", "schema_version", "page_count",
                "finding_count", "info_count", "warning_count",
                "error_count", "findings",
            },
            "SourcePreAnalysisOverviewRead": {
                "source_document_id", "media_asset_id", "question_source_id",
                "uploaded_by_user_id", "latest_run",
                "latest_successful_result",
            },
        }

        for model_name, field_names in expected.items():
            with self.subTest(model=model_name):
                model = getattr(schema_module, model_name)
                self.assertEqual(set(model.model_fields), field_names)

    def test_models_use_strict_attribute_aware_configuration(self) -> None:
        for model in (
            SourcePreAnalysisRunRead,
            SourcePreAnalysisFindingRead,
            SourcePreAnalysisSuccessfulResultRead,
            SourcePreAnalysisOverviewRead,
        ):
            with self.subTest(model=model.__name__):
                self.assertEqual(model.model_config["extra"], "forbid")
                self.assertTrue(model.model_config["from_attributes"])

        payload = self._run().model_dump()
        payload["deleted_at"] = NOW
        with self.assertRaises(ValidationError):
            SourcePreAnalysisRunRead.model_validate(payload)

    def test_uuid_enum_datetime_and_decimal_python_types_are_preserved(self) -> None:
        run = self._run(status=SourcePreAnalysisRunStatus.RUNNING)
        page_id = uuid.uuid4()
        finding = self._finding(
            severity=SourcePreAnalysisFindingSeverity.WARNING,
            confidence=Decimal("0.1234"),
            page_id=page_id,
            page_number=9,
        )

        self.assertIsInstance(run.id, uuid.UUID)
        self.assertIsInstance(run.source_document_id, uuid.UUID)
        self.assertIs(run.status, SourcePreAnalysisRunStatus.RUNNING)
        self.assertEqual(run.started_at, NOW)
        self.assertIs(
            finding.severity, SourcePreAnalysisFindingSeverity.WARNING,
        )
        self.assertIsInstance(finding.confidence, Decimal)
        self.assertEqual(finding.confidence, Decimal("0.1234"))
        self.assertEqual(finding.source_document_page_id, page_id)
        self.assertEqual(finding.page_number, 9)

    def test_json_serialization_uses_canonical_uuid_enum_and_decimal_values(self) -> None:
        run = self._run(status=SourcePreAnalysisRunStatus.FAILED)
        finding = self._finding(
            severity=SourcePreAnalysisFindingSeverity.ERROR,
            confidence=Decimal("0.1000"),
        )

        run_json = json.loads(run.model_dump_json())
        finding_json = json.loads(finding.model_dump_json())

        self.assertEqual(run_json["id"], str(run.id))
        self.assertEqual(
            run_json["source_document_id"], str(run.source_document_id),
        )
        self.assertEqual(run_json["status"], "failed")
        self.assertEqual(finding_json["severity"], "error")
        self.assertEqual(finding_json["confidence"], "0.1000")
        self.assertNotIsInstance(finding_json["confidence"], float)

    def test_all_required_nullable_fields_accept_and_preserve_none(self) -> None:
        run = SourcePreAnalysisRunRead(
            id=uuid.uuid4(), source_document_id=uuid.uuid4(), run_number=1,
            status=SourcePreAnalysisRunStatus.PENDING,
            requested_by_user_id=None, started_at=None, completed_at=None,
            failure_message=None,
        )
        finding = self._finding(confidence=None)
        overview = SourcePreAnalysisOverviewRead(
            source_document_id=run.source_document_id,
            media_asset_id=uuid.uuid4(),
            question_source_id=None,
            uploaded_by_user_id=None,
            latest_run=None,
            latest_successful_result=None,
        )

        self.assertIsNone(run.requested_by_user_id)
        self.assertIsNone(run.started_at)
        self.assertIsNone(run.completed_at)
        self.assertIsNone(run.failure_message)
        self.assertIsNone(finding.confidence)
        self.assertIsNone(finding.source_document_page_id)
        self.assertIsNone(finding.page_number)
        self.assertIsNone(overview.question_source_id)
        self.assertIsNone(overview.uploaded_by_user_id)
        self.assertIsNone(overview.latest_run)
        self.assertIsNone(overview.latest_successful_result)

    def test_page_count_values_empty_findings_and_exact_counts_are_preserved(self) -> None:
        for page_count in (None, 0, 17):
            with self.subTest(page_count=page_count):
                result = self._successful(page_count=page_count)
                self.assertEqual(result.page_count, page_count)
                self.assertEqual(result.findings, [])
                self.assertEqual(result.finding_count, 0)

        exact = SourcePreAnalysisSuccessfulResultRead(
            run=self._run(), result_id=uuid.uuid4(), schema_version=3,
            page_count=2, finding_count=12, info_count=7,
            warning_count=4, error_count=1, findings=[],
        )
        self.assertEqual(
            (exact.finding_count, exact.info_count, exact.warning_count,
             exact.error_count),
            (12, 7, 4, 1),
        )

    def test_populated_findings_preserve_order_and_page_distinctions(self) -> None:
        source_level = self._finding(page_id=None, page_number=None)
        page_id = uuid.uuid4()
        page_level = self._finding(page_id=page_id, page_number=3)
        result = self._successful(findings=[source_level, page_level])

        self.assertEqual(
            [item.id for item in result.findings],
            [source_level.id, page_level.id],
        )
        self.assertIsNone(result.findings[0].source_document_page_id)
        self.assertIsNone(result.findings[0].page_number)
        self.assertEqual(result.findings[1].source_document_page_id, page_id)
        self.assertEqual(result.findings[1].page_number, 3)

    def test_failed_latest_run_and_older_success_can_coexist(self) -> None:
        source_id = uuid.uuid4()
        failed = self._run(
            status=SourcePreAnalysisRunStatus.FAILED,
            run_number=5,
        )
        successful_run = self._run(
            status=SourcePreAnalysisRunStatus.SUCCEEDED,
            run_number=4,
        )
        failed.source_document_id = source_id
        successful_run.source_document_id = source_id
        overview = SourcePreAnalysisOverviewRead(
            source_document_id=source_id,
            media_asset_id=uuid.uuid4(),
            question_source_id=None,
            uploaded_by_user_id=None,
            latest_run=failed,
            latest_successful_result=self._successful(run=successful_run),
        )

        self.assertEqual(overview.latest_run.status, SourcePreAnalysisRunStatus.FAILED)
        self.assertEqual(overview.latest_run.run_number, 5)
        self.assertEqual(
            overview.latest_successful_result.run.status,
            SourcePreAnalysisRunStatus.SUCCEEDED,
        )
        self.assertEqual(overview.latest_successful_result.run.run_number, 4)

    def test_public_contract_exposes_no_internal_or_request_fields(self) -> None:
        all_fields = {
            field
            for model in (
                SourcePreAnalysisRunRead,
                SourcePreAnalysisFindingRead,
                SourcePreAnalysisSuccessfulResultRead,
                SourcePreAnalysisOverviewRead,
            )
            for field in model.model_fields
        }
        prohibited = {
            "deleted_at", "storage_key", "storage_path", "ocr_text",
            "provider_payload", "prompt", "secret", "source_text",
            "raw_source_content",
        }
        self.assertTrue(all_fields.isdisjoint(prohibited))
        self.assertFalse(any(
            name.endswith("Request")
            for name in vars(schema_module)
            if name.startswith("SourcePreAnalysis")
        ))


if __name__ == "__main__":
    unittest.main()
