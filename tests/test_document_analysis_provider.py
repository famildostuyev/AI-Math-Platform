from __future__ import annotations

import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisAnswerOption,
    DocumentAnalysisCorrection,
    DocumentAnalysisPage,
    DocumentAnalysisPageReference,
    DocumentAnalysisPageVisual,
    DocumentAnalysisProvenance,
    DocumentAnalysisProvider,
    DocumentAnalysisRequest,
    DocumentAnalysisNeighborPage,
    MathSegment,
    QuestionAnalysis,
    StructuredContent,
    TextSegment,
)


class DocumentAnalysisProviderContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.document_id = uuid.uuid4()
        self.page_id = uuid.uuid4()

    def _request(self, **overrides: object) -> DocumentAnalysisRequest:
        values: dict[str, object] = {
            "source_document_id": self.document_id,
            "pages": (
                DocumentAnalysisPage(
                    source_document_page_id=self.page_id,
                    page_number=1,
                    raw_extracted_text="1. Find x.",
                    visual_content=DocumentAnalysisPageVisual(
                        mime_type="image/png",
                        content=b"page-image",
                    ),
                    neighbor_context=(
                        DocumentAnalysisNeighborPage(
                            source_document_page_id=uuid.uuid4(),
                            page_number=2,
                            raw_extracted_text="Continuation context",
                        ),
                    ),
                ),
            ),
            "original_language": "az",
            "processing_version": "1",
            "prompt_version": "question-analysis-v1",
            "schema_version": 1,
        }
        values.update(overrides)
        return DocumentAnalysisRequest.model_validate(values)

    def _analysis(self, **overrides: object) -> DocumentAnalysis:
        values: dict[str, object] = {
            "schema_version": 1,
            "detected_language": "az",
            "questions": (
                QuestionAnalysis(
                    question_number="1",
                    question_text="Find x.",
                    answer_options=(
                        DocumentAnalysisAnswerOption(label="A", text="2"),
                    ),
                    source_pages=(
                        DocumentAnalysisPageReference(
                            source_document_page_id=self.page_id,
                            page_number=1,
                        ),
                    ),
                    visual_required=False,
                    confidence=Decimal("0.95"),
                    needs_review=False,
                    corrections=(),
                ),
            ),
            "provenance": DocumentAnalysisProvenance(
                provider_name="provider",
                model_name="document-model",
                processor_version="1",
                prompt_version="question-analysis-v1",
                schema_version=1,
            ),
        }
        values.update(overrides)
        return DocumentAnalysis.model_validate(values)

    def test_valid_request_accepts_text_visual_and_neighbor_context(self) -> None:
        request = self._request()

        self.assertEqual(request.source_document_id, self.document_id)
        self.assertEqual(request.pages[0].source_document_page_id, self.page_id)
        self.assertEqual(request.pages[0].visual_content.content, b"page-image")
        self.assertEqual(request.pages[0].neighbor_context[0].page_number, 2)

    def test_valid_document_analysis_accepts_structured_questions(self) -> None:
        analysis = self._analysis()

        self.assertEqual(analysis.detected_language, "az")
        self.assertEqual(analysis.questions[0].question_text, "Find x.")
        self.assertEqual(analysis.questions[0].answer_options[0].label, "A")
        self.assertEqual(analysis.provenance.provider_name, "provider")

    def test_versioned_content_preserves_mixed_segment_order_and_fidelity(self) -> None:
        fidelity_pairs = (
            ("(sinα + 2cosα) / cosα", r"\frac{\sin\alpha + 2\cos\alpha}{\cos\alpha}"),
            ("√(x+1)", r"\sqrt{x+1}"),
            ("x²", "x^2"),
            ("a₁", "a_1"),
            ("α = 90°", r"\alpha = 90^\circ"),
        )
        segments = [TextSegment(text="Hesablayın: ")]
        segments.extend(
            MathSegment(latex=latex, source_text=source)
            for source, latex in fidelity_pairs
        )
        segments.append(TextSegment(text=" cavabını seçin."))
        content = StructuredContent(segments=tuple(segments))

        self.assertEqual(content.format_version, 1)
        self.assertEqual(content.segments[0].type, "text")
        self.assertEqual(content.segments[-1].type, "text")
        self.assertEqual(
            [(segment.source_text, segment.latex) for segment in content.segments[1:-1]],
            list(fidelity_pairs),
        )

    def test_structured_content_validation_is_strict(self) -> None:
        invalid_values = (
            {"segments": []},
            {"segments": [{"type": "text", "text": ""}]},
            {"segments": [{"type": "math", "latex": "", "source_text": "x"}]},
            {"segments": [{"type": "math", "latex": "x", "source_text": ""}]},
            {"segments": [{"type": "unknown", "text": "x"}]},
            {"segments": [{"type": "text", "text": "x", "unknown": True}]},
            {"format_version": 2, "segments": [{"type": "text", "text": "x"}]},
        )
        for values in invalid_values:
            with self.subTest(values=values), self.assertRaises(ValidationError):
                StructuredContent.model_validate(values)

    def test_question_and_option_content_are_optional_legacy_extensions(self) -> None:
        analysis = self._analysis()
        question = analysis.questions[0]

        self.assertIsNone(question.content)
        self.assertIsNone(question.answer_options[0].content)
        self.assertEqual(question.question_text, "Find x.")
        self.assertEqual(question.answer_options[0].text, "2")

    def test_unknown_fields_are_rejected_at_every_contract_boundary(self) -> None:
        with self.assertRaises(ValidationError):
            self._request(openai_file_id="file-provider-specific")

        with self.assertRaises(ValidationError):
            DocumentAnalysisPageReference.model_validate(
                {
                    "source_document_page_id": self.page_id,
                    "page_number": 1,
                    "provider_page_id": "provider-page",
                }
            )

        with self.assertRaises(ValidationError):
            self._analysis(openai_response_id="response-provider-specific")

    def test_invalid_question_structure_is_rejected(self) -> None:
        valid = self._analysis()
        question = valid.questions[0].model_dump()

        for update in (
            {"question_text": "   "},
            {"source_pages": ()},
            {"visual_required": "false"},
            {"needs_review": 0},
        ):
            with self.subTest(update=update), self.assertRaises(ValidationError):
                QuestionAnalysis.model_validate({**question, **update})

    def test_invalid_confidence_is_rejected(self) -> None:
        valid = self._analysis().questions[0].model_dump()

        for confidence in (Decimal("-0.01"), Decimal("1.01"), "0.5"):
            with self.subTest(confidence=confidence), self.assertRaises(
                ValidationError
            ):
                QuestionAnalysis.model_validate(
                    {**valid, "confidence": confidence}
                )

    def test_invalid_page_references_are_rejected(self) -> None:
        for values in (
            {
                "source_document_page_id": "not-a-uuid",
                "page_number": 1,
            },
            {
                "source_document_page_id": self.page_id,
                "page_number": 0,
            },
            {
                "source_document_page_id": self.page_id,
                "page_number": True,
            },
        ):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                DocumentAnalysisPageReference.model_validate(values)

    def test_correction_structure_is_strict_and_preserves_values(self) -> None:
        correction = DocumentAnalysisCorrection(
            original_value="15 sm",
            normalized_value="16 sm",
            reason="OCR correction supported by the page visual.",
        )

        self.assertEqual(correction.original_value, "15 sm")
        self.assertEqual(correction.normalized_value, "16 sm")

        for field_name in ("original_value", "normalized_value", "reason"):
            with self.subTest(field=field_name), self.assertRaises(
                ValidationError
            ):
                DocumentAnalysisCorrection.model_validate(
                    {
                        "original_value": "15 sm",
                        "normalized_value": "16 sm",
                        "reason": "OCR correction",
                        field_name: "   ",
                    }
                )

    def test_structural_provider_implements_protocol_and_returns_contract(self) -> None:
        expected = self._analysis()

        class FakeProvider:
            def analyze_document(
                self,
                request: DocumentAnalysisRequest,
            ) -> DocumentAnalysis:
                self.request = request
                return expected

        provider = FakeProvider()
        request = self._request()

        self.assertIsInstance(provider, DocumentAnalysisProvider)
        self.assertIs(provider.analyze_document(request), expected)
        self.assertIs(provider.request, request)

    def test_provider_specific_identifiers_cannot_leak_into_domain_dtos(self) -> None:
        forbidden_fields = {
            "openai_file_id",
            "openai_response_id",
            "anthropic_message_id",
            "gemini_upload_name",
            "provider_request",
            "provider_response",
            "api_key",
        }

        contract_fields = set(DocumentAnalysisRequest.model_fields)
        contract_fields.update(DocumentAnalysis.model_fields)
        contract_fields.update(DocumentAnalysisProvenance.model_fields)
        contract_fields.update(QuestionAnalysis.model_fields)

        self.assertTrue(forbidden_fields.isdisjoint(contract_fields))


if __name__ == "__main__":
    unittest.main()
