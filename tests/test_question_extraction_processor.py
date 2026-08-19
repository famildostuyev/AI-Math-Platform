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

from app.services.question_extraction_processor import (
    QuestionExtractionProcessorCandidate,
    QuestionExtractionProcessorCandidateError,
    QuestionExtractionProcessorDeclarationError,
    QuestionExtractionProcessorExecution,
    QuestionExtractionProcessorProvenance,
    QuestionExtractionProcessorProvenanceError,
    QuestionExtractionProcessorResult,
    QuestionExtractionProcessorResultError,
    QuestionExtractionUnsupportedMimeError,
    RegisteredQuestionExtractionProcessorSelector,
    ResolvedQuestionExtractionSourceBinary,
    validate_processor_execution,
    validate_processor_provenance,
    validate_processor_result,
)


class QuestionExtractionProcessorContractTest(unittest.TestCase):
    @staticmethod
    def _candidate(**changes: object) -> QuestionExtractionProcessorCandidate:
        values = {
            "page_number": 1,
            "extracted_text": " Find x. ",
            "confidence": Decimal("0.75"),
        }
        values.update(changes)
        return QuestionExtractionProcessorCandidate(**values)  # type: ignore[arg-type]

    @classmethod
    def _result(cls, **changes: object) -> QuestionExtractionProcessorResult:
        values = {
            "schema_version": 1,
            "candidates": (cls._candidate(),),
        }
        values.update(changes)
        return QuestionExtractionProcessorResult(**values)  # type: ignore[arg-type]

    def test_dtos_are_frozen_slotted_and_have_only_exact_fields(self) -> None:
        stream = io.BytesIO(b"source")
        source = ResolvedQuestionExtractionSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type="application/pdf",
            original_filename="book.pdf",
            size_bytes=6,
            width_px=None,
            height_px=None,
            stream=stream,
        )

        self.assertEqual(
            tuple(field.name for field in fields(source)),
            (
                "source_document_id",
                "media_asset_id",
                "mime_type",
                "original_filename",
                "size_bytes",
                "width_px",
                "height_px",
                "stream",
            ),
        )
        self.assertFalse(hasattr(source, "__dict__"))
        for forbidden in ("storage_key", "path", "sha256", "db", "session"):
            self.assertFalse(hasattr(source, forbidden))
        with self.assertRaises(FrozenInstanceError):
            source.size_bytes = 7  # type: ignore[misc]

        self.assertEqual(
            tuple(field.name for field in fields(self._candidate())),
            ("page_number", "extracted_text", "confidence"),
        )
        self.assertEqual(
            tuple(field.name for field in fields(self._result())),
            ("schema_version", "candidates"),
        )
        self.assertIsInstance(self._result().candidates, tuple)

    def test_registry_selects_exact_mime_and_rejects_unsupported(self) -> None:
        pdf = SimpleNamespace(
            supported_mime_types=frozenset({"application/pdf"}),
            process=lambda **_: QuestionExtractionProcessorExecution(
                result=self._result(),
                provenance=QuestionExtractionProcessorProvenance("pdf-extraction", "1"),
            ),
        )

        selector = RegisteredQuestionExtractionProcessorSelector((pdf,))
        self.assertIs(selector.select(mime_type="application/pdf"), pdf)

        for mime in ("Application/PDF", " application/pdf ", "image/png"):
            with self.subTest(mime=mime), self.assertRaises(
                QuestionExtractionUnsupportedMimeError
            ):
                selector.select(mime_type=mime)

    def test_duplicate_or_invalid_processor_declaration_is_rejected(self) -> None:
        first = SimpleNamespace(
            supported_mime_types=frozenset({"application/pdf"}),
            process=lambda **_: None,
        )
        second = SimpleNamespace(
            supported_mime_types=frozenset({"application/pdf"}),
            process=lambda **_: None,
        )

        with self.assertRaises(QuestionExtractionProcessorDeclarationError):
            RegisteredQuestionExtractionProcessorSelector((first, second))

        for invalid in (
            SimpleNamespace(
                supported_mime_types={"image/png"},
                process=lambda: None,
            ),
            SimpleNamespace(
                supported_mime_types=frozenset(),
                process=lambda: None,
            ),
            SimpleNamespace(
                supported_mime_types=frozenset({" image/png"}),
                process=lambda: None,
            ),
            SimpleNamespace(supported_mime_types=frozenset({"image/png"})),
            SimpleNamespace(),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(
                QuestionExtractionProcessorDeclarationError
            ):
                RegisteredQuestionExtractionProcessorSelector((invalid,))

    def test_valid_result_is_normalized_without_mutating_input(self) -> None:
        original = self._result()
        normalized = validate_processor_result(original)

        self.assertIsNot(normalized, original)
        self.assertEqual(original.candidates[0].extracted_text, " Find x. ")
        self.assertEqual(normalized.candidates[0].extracted_text, "Find x.")
        self.assertEqual(normalized.candidates[0].page_number, 1)
        self.assertEqual(normalized.candidates[0].confidence, Decimal("0.75"))

        nullable = validate_processor_result(
            self._result(
                candidates=(
                    self._candidate(page_number=None, confidence=None),
                )
            )
        )
        self.assertIsNone(nullable.candidates[0].page_number)
        self.assertIsNone(nullable.candidates[0].confidence)

        empty = validate_processor_result(self._result(candidates=()))
        self.assertEqual(empty.candidates, ())

    def test_invalid_result_shape_and_schema_are_rejected_strictly(self) -> None:
        for schema in (0, -1, True, False, 1.0, "1"):
            with self.subTest(schema=schema), self.assertRaises(
                QuestionExtractionProcessorResultError
            ):
                validate_processor_result(
                    self._result(schema_version=schema)
                )

        with self.assertRaises(QuestionExtractionProcessorResultError):
            validate_processor_result(self._result(candidates=[]))

        with self.assertRaises(QuestionExtractionProcessorResultError):
            validate_processor_result("not-a-result")  # type: ignore[arg-type]

    def test_invalid_candidate_page_and_text_are_rejected(self) -> None:
        cases = (
            {"page_number": 0},
            {"page_number": -1},
            {"page_number": True},
            {"page_number": 1.0},
            {"page_number": "1"},
            {"extracted_text": ""},
            {"extracted_text": " "},
            {"extracted_text": 1},
        )

        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(
                QuestionExtractionProcessorCandidateError
            ):
                validate_processor_result(
                    self._result(
                        candidates=(self._candidate(**changes),)
                    )
                )

    def test_confidence_is_nullable_finite_decimal_in_closed_unit_range(self) -> None:
        for confidence in (
            None,
            Decimal("0"),
            Decimal("0.5"),
            Decimal("1"),
        ):
            validate_processor_result(
                self._result(
                    candidates=(self._candidate(confidence=confidence),)
                )
            )

        for confidence in (
            0,
            0.5,
            1,
            Decimal("-0.1"),
            Decimal("1.1"),
            Decimal("NaN"),
            Decimal("Infinity"),
            Decimal("-Infinity"),
        ):
            with self.subTest(confidence=confidence), self.assertRaises(
                QuestionExtractionProcessorCandidateError
            ):
                validate_processor_result(
                    self._result(
                        candidates=(self._candidate(confidence=confidence),)
                    )
                )

    def test_provenance_and_execution_dtos_are_exact_frozen_slotted(self) -> None:
        provenance = QuestionExtractionProcessorProvenance(
            processor_name="pdf-extraction",
            processor_version="1",
        )
        execution = QuestionExtractionProcessorExecution(
            result=self._result(),
            provenance=provenance,
        )

        self.assertEqual(
            tuple(field.name for field in fields(provenance)),
            (
                "processor_name",
                "processor_version",
                "provider_name",
                "model_name",
                "prompt_version",
            ),
        )
        self.assertEqual(
            tuple(field.name for field in fields(execution)),
            ("result", "provenance"),
        )
        self.assertFalse(hasattr(provenance, "__dict__"))
        self.assertFalse(hasattr(execution, "__dict__"))

        with self.assertRaises(FrozenInstanceError):
            provenance.processor_name = "changed"  # type: ignore[misc]

    def test_valid_provenance_combinations_normalize_without_mutation(self) -> None:
        cases = (
            {},
            {"provider_name": " openai "},
            {"model_name": " local/model:v1 "},
            {"prompt_version": " prompt-v2 "},
            {
                "provider_name": " local-ai ",
                "model_name": " Model/X ",
                "prompt_version": " config.3 ",
            },
        )

        for optional in cases:
            with self.subTest(optional=optional):
                original = QuestionExtractionProcessorProvenance(
                    processor_name=" pdf-extraction ",
                    processor_version=" v1+build.2 ",
                    **optional,
                )
                normalized = validate_processor_provenance(original)

                self.assertIsNot(normalized, original)
                self.assertEqual(normalized.processor_name, "pdf-extraction")
                self.assertEqual(normalized.processor_version, "v1+build.2")
                self.assertEqual(original.processor_name, " pdf-extraction ")

                for field_name, value in optional.items():
                    self.assertEqual(
                        getattr(normalized, field_name),
                        value.strip(),
                    )

    def test_invalid_provenance_fields_are_rejected_strictly(self) -> None:
        cases = (
            {"processor_name": 1},
            {"processor_name": ""},
            {"processor_name": " "},
            {"processor_name": "x" * 101},
            {"processor_name": "PDF"},
            {"processor_name": "bad name"},
            {"processor_name": "bad/slug"},
            {"processor_version": 1},
            {"processor_version": ""},
            {"processor_version": " "},
            {"processor_version": "x" * 101},
            {"provider_name": 1},
            {"provider_name": ""},
            {"provider_name": " "},
            {"provider_name": "x" * 101},
            {"provider_name": "OpenAI"},
            {"provider_name": "bad provider"},
            {"model_name": 1},
            {"model_name": ""},
            {"model_name": " "},
            {"model_name": "x" * 201},
            {"prompt_version": 1},
            {"prompt_version": ""},
            {"prompt_version": " "},
            {"prompt_version": "x" * 101},
            {"prompt_version": "version\nprompt body"},
            {"prompt_version": "actual prompt text"},
        )
        defaults: dict[str, object] = {
            "processor_name": "test-processor",
            "processor_version": "1",
        }

        for changes in cases:
            values = {**defaults, **changes}
            with self.subTest(changes=changes), self.assertRaises(
                QuestionExtractionProcessorProvenanceError
            ):
                validate_processor_provenance(
                    QuestionExtractionProcessorProvenance(
                        **values  # type: ignore[arg-type]
                    )
                )

    def test_execution_validation_normalizes_both_contracts(self) -> None:
        execution = QuestionExtractionProcessorExecution(
            result=self._result(),
            provenance=QuestionExtractionProcessorProvenance(
                " test-processor ",
                " 1 ",
                provider_name=" local-ai ",
            ),
        )

        normalized = validate_processor_execution(execution)
        self.assertIsNot(normalized, execution)
        self.assertEqual(
            normalized.result.candidates[0].extracted_text,
            "Find x.",
        )
        self.assertEqual(
            normalized.provenance.processor_name,
            "test-processor",
        )
        self.assertEqual(
            normalized.provenance.provider_name,
            "local-ai",
        )

        with self.assertRaises(QuestionExtractionProcessorResultError):
            validate_processor_execution(
                QuestionExtractionProcessorExecution(
                    result=self._result(schema_version=0),
                    provenance=execution.provenance,
                )
            )

        with self.assertRaises(QuestionExtractionProcessorProvenanceError):
            validate_processor_execution(
                QuestionExtractionProcessorExecution(
                    result=self._result(),
                    provenance=QuestionExtractionProcessorProvenance(
                        "BAD",
                        "1",
                    ),
                )
            )


if __name__ == "__main__":
    unittest.main()
