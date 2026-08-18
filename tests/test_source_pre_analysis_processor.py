from __future__ import annotations

import io
import os
import sys
import unittest
import uuid
from dataclasses import FrozenInstanceError, fields
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.source_pre_analysis_processor import (
    RegisteredSourcePreAnalysisProcessorSelector,
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorDeclarationError,
    SourcePreAnalysisProcessorFinding,
    SourcePreAnalysisProcessorFindingError,
    SourcePreAnalysisProcessorResult,
    SourcePreAnalysisProcessorResultError,
    SourcePreAnalysisUnsupportedMimeError,
    validate_processor_result,
)


class SourcePreAnalysisProcessorContractTest(unittest.TestCase):
    @staticmethod
    def _finding(**changes: object) -> SourcePreAnalysisProcessorFinding:
        values = {
            "page_number": 1,
            "finding_code": " formula_present ",
            "severity": SourcePreAnalysisFindingSeverity.INFO,
            "confidence": Decimal("0.75"),
            "message": " Formula detected. ",
        }
        values.update(changes)
        return SourcePreAnalysisProcessorFinding(**values)  # type: ignore[arg-type]

    @classmethod
    def _result(cls, **changes: object) -> SourcePreAnalysisProcessorResult:
        values = {
            "schema_version": 1,
            "page_count": 1,
            "findings": (cls._finding(),),
        }
        values.update(changes)
        return SourcePreAnalysisProcessorResult(**values)  # type: ignore[arg-type]

    def test_dtos_are_frozen_slotted_and_have_only_exact_fields(self) -> None:
        stream = io.BytesIO(b"source")
        source = ResolvedSourceBinary(
            source_document_id=uuid.uuid4(), media_asset_id=uuid.uuid4(),
            mime_type="application/pdf", original_filename="book.pdf",
            size_bytes=6, width_px=None, height_px=None, stream=stream,
        )
        self.assertEqual(
            tuple(field.name for field in fields(source)),
            ("source_document_id", "media_asset_id", "mime_type",
             "original_filename", "size_bytes", "width_px", "height_px",
             "stream"),
        )
        self.assertFalse(hasattr(source, "__dict__"))
        for forbidden in ("storage_key", "path", "sha256", "db", "session"):
            self.assertFalse(hasattr(source, forbidden))
        with self.assertRaises(FrozenInstanceError):
            source.size_bytes = 7  # type: ignore[misc]
        self.assertEqual(
            tuple(field.name for field in fields(self._finding())),
            ("page_number", "finding_code", "severity", "confidence", "message"),
        )
        self.assertIsInstance(self._result().findings, tuple)

    def test_registry_selects_exact_mime_and_rejects_unsupported(self) -> None:
        pdf = SimpleNamespace(
            processor_name="pdf", processor_version="1",
            supported_mime_types=frozenset({"application/pdf"}),
            process=lambda **_: self._result(),
        )
        selector = RegisteredSourcePreAnalysisProcessorSelector((pdf,))
        self.assertIs(selector.select(mime_type="application/pdf"), pdf)
        for mime in ("Application/PDF", " application/pdf ", "image/png"):
            with self.subTest(mime=mime), self.assertRaises(
                SourcePreAnalysisUnsupportedMimeError
            ):
                selector.select(mime_type=mime)

    def test_duplicate_or_invalid_processor_declaration_is_rejected(self) -> None:
        first = SimpleNamespace(
            processor_name="first", processor_version="1",
            supported_mime_types=frozenset({"application/pdf"}),
        )
        second = SimpleNamespace(
            processor_name="second", processor_version="1",
            supported_mime_types=frozenset({"application/pdf"}),
        )
        with self.assertRaises(SourcePreAnalysisProcessorDeclarationError):
            RegisteredSourcePreAnalysisProcessorSelector((first, second))
        for invalid in (
            SimpleNamespace(processor_name="", processor_version="1",
                            supported_mime_types=frozenset({"image/png"})),
            SimpleNamespace(processor_name="image", processor_version="",
                            supported_mime_types=frozenset({"image/png"})),
            SimpleNamespace(processor_name="image", processor_version="1",
                            supported_mime_types={"image/png"}),
            SimpleNamespace(processor_name="image", processor_version="1",
                            supported_mime_types=frozenset()),
            SimpleNamespace(processor_name="image", processor_version="1",
                            supported_mime_types=frozenset({" image/png"})),
            SimpleNamespace(),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(
                SourcePreAnalysisProcessorDeclarationError
            ):
                RegisteredSourcePreAnalysisProcessorSelector((invalid,))

    def test_valid_result_is_normalized_without_mutating_input(self) -> None:
        original = self._result()
        normalized = validate_processor_result(original)
        self.assertIsNot(normalized, original)
        self.assertEqual(original.findings[0].finding_code, " formula_present ")
        self.assertEqual(normalized.findings[0].finding_code, "formula_present")
        self.assertEqual(normalized.findings[0].message, "Formula detected.")
        for page_count in (None, 0, 4):
            with self.subTest(page_count=page_count):
                self.assertEqual(
                    validate_processor_result(
                        self._result(page_count=page_count)
                    ).page_count,
                    page_count,
                )
        self.assertIsNone(validate_processor_result(self._result(
            findings=(self._finding(page_number=None, confidence=None),)
        )).findings[0].page_number)

    def test_invalid_result_scalars_are_rejected_strictly(self) -> None:
        for schema in (0, -1, True, False, 1.0, "1"):
            with self.subTest(schema=schema), self.assertRaises(
                SourcePreAnalysisProcessorResultError
            ):
                validate_processor_result(self._result(schema_version=schema))
        for count in (-1, True, False, 1.0, "1"):
            with self.subTest(count=count), self.assertRaises(
                SourcePreAnalysisProcessorResultError
            ):
                validate_processor_result(self._result(page_count=count))
        with self.assertRaises(SourcePreAnalysisProcessorResultError):
            validate_processor_result(self._result(findings=[]))

    def test_invalid_page_code_severity_and_message_are_rejected(self) -> None:
        cases = (
            {"page_number": 0}, {"page_number": -1}, {"page_number": True},
            {"page_number": 1.0}, {"finding_code": ""},
            {"finding_code": " "}, {"finding_code": "x" * 101},
            {"finding_code": 1}, {"severity": "info"},
            {"message": ""}, {"message": " "}, {"message": 1},
        )
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(
                SourcePreAnalysisProcessorFindingError
            ):
                validate_processor_result(self._result(
                    findings=(self._finding(**changes),)
                ))

    def test_confidence_is_nullable_finite_decimal_in_closed_unit_range(self) -> None:
        for confidence in (None, Decimal("0"), Decimal("0.5"), Decimal("1")):
            validate_processor_result(self._result(
                findings=(self._finding(confidence=confidence),)
            ))
        for confidence in (
            0, 0.5, 1, Decimal("-0.1"), Decimal("1.1"),
            Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity"),
        ):
            with self.subTest(confidence=confidence), self.assertRaises(
                SourcePreAnalysisProcessorFindingError
            ):
                validate_processor_result(self._result(
                    findings=(self._finding(confidence=confidence),)
                ))

    def test_no_finding_code_registry_is_present(self) -> None:
        module = Path(
            BACKEND_DIR / "app/services/source_pre_analysis_processor.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("FindingCode", module)
        self.assertNotIn("allowed_finding", module.lower())


if __name__ == "__main__":
    unittest.main()
