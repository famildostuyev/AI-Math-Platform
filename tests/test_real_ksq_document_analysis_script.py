from __future__ import annotations

import os
import sys
import unittest
import uuid
from decimal import Decimal
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisPageReference,
    DocumentAnalysisProvenance,
    QuestionAnalysis,
)
from app.services.openai_document_analysis_provider import (
    DOCUMENT_ANALYSIS_INSTRUCTIONS,
)
from scripts.run_real_ksq_document_analysis import (
    ACCEPTANCE_INSTRUCTIONS,
    _variant_name,
    summarize_analysis,
)


class RealKsqDocumentAnalysisScriptTest(unittest.TestCase):
    def test_acceptance_prompt_requires_visual_ocr_and_variant_separation(self) -> None:
        self.assertIs(ACCEPTANCE_INSTRUCTIONS, DOCUMENT_ANALYSIS_INSTRUCTIONS)
        self.assertIn("Variant C", ACCEPTANCE_INSTRUCTIONS)
        self.assertIn("Variant D", ACCEPTANCE_INSTRUCTIONS)
        self.assertIn("visual", ACCEPTANCE_INSTRUCTIONS)
        self.assertIn("OCR", ACCEPTANCE_INSTRUCTIONS)
        self.assertIn("Do not translate", ACCEPTANCE_INSTRUCTIONS)

    def test_variant_name_is_derived_without_changing_domain_contract(self) -> None:
        self.assertEqual(_variant_name("Variant C / 4"), "Variant C")
        self.assertEqual(_variant_name("variant d / 2"), "Variant D")
        self.assertEqual(_variant_name("7"), "Unclassified")
        self.assertEqual(_variant_name(None), "Unclassified")

    def test_summary_uses_only_provider_neutral_analysis(self) -> None:
        reference = DocumentAnalysisPageReference(
            source_document_page_id=uuid.uuid4(), page_number=1,
        )
        analysis = DocumentAnalysis(
            schema_version=1,
            detected_language="az",
            questions=(
                QuestionAnalysis(
                    question_number="Variant C / 1",
                    question_text="Question one",
                    answer_options=(),
                    source_pages=(reference,),
                    visual_required=True,
                    confidence=Decimal("0.8"),
                    needs_review=True,
                    corrections=(),
                ),
                QuestionAnalysis(
                    question_number="Variant D / 1",
                    question_text="Question two",
                    answer_options=(),
                    source_pages=(reference,),
                    visual_required=False,
                    confidence=Decimal("1"),
                    needs_review=False,
                    corrections=(),
                ),
            ),
            provenance=DocumentAnalysisProvenance(
                provider_name="openai",
                model_name="configured-model",
                processor_version="1",
                prompt_version="question-analysis-v1",
                schema_version=1,
            ),
        )
        summary = summarize_analysis(analysis)
        self.assertEqual(summary["total_questions"], 2)
        self.assertEqual(
            summary["variant_counts"], {"Variant C": 1, "Variant D": 1},
        )
        self.assertEqual(summary["needs_review_count"], 1)
        self.assertEqual(summary["visual_required_count"], 1)
        self.assertNotIn("api_key", summary)


if __name__ == "__main__":
    unittest.main()
