from __future__ import annotations

import inspect
import os
import sys
import unittest
import uuid
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.config import settings
from app.services.document_analysis_provider import DocumentAnalysisPageVisual
from app.services.openai_document_analysis_provider import (
    DOCUMENT_ANALYSIS_INSTRUCTIONS,
    OpenAIDocumentAnalysisProvider,
    build_document_analysis_request,
)
from app.services.raw_document import RawDocument, RawDocumentPage
from scripts import run_text_only_document_analysis_diagnostic as diagnostic


class TextOnlyDocumentAnalysisDiagnosticTest(unittest.TestCase):
    def setUp(self) -> None:
        self.page_id = uuid.uuid4()
        self.raw_document = RawDocument(
            source_document_id=uuid.uuid4(),
            pages=(
                RawDocumentPage(
                    source_document_page_id=self.page_id,
                    page_number=1,
                    raw_text="private source content",
                    visual_content=DocumentAnalysisPageVisual(
                        mime_type="image/png",
                        content=b"private-image-content",
                    ),
                    extraction_method="pdf_text_layer",
                    extraction_version="1",
                ),
            ),
        )

    def test_request_is_canonical_text_only_with_same_page_identity(self) -> None:
        request = build_document_analysis_request(
            diagnostic.without_visual_content(self.raw_document)
        )
        mapped = OpenAIDocumentAnalysisProvider._map_request(request)
        content = mapped[0]["content"]

        self.assertEqual(len(mapped), 1)
        self.assertEqual([item["type"] for item in content], ["input_text"])
        self.assertIsNone(request.pages[0].visual_content)
        self.assertEqual(request.pages[0].source_document_page_id, self.page_id)
        self.assertEqual(request.pages[0].raw_extracted_text,
                         "private source content")
        self.assertEqual(request.prompt_version, "question-analysis-v3")
        self.assertEqual(request.processing_version, "1")
        self.assertEqual(request.schema_version, 1)
        self.assertEqual(settings.OPENAI_DOCUMENT_ANALYSIS_MODEL, "gpt-5-mini")
        self.assertEqual(settings.OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS, 180.0)
        self.assertIs(
            diagnostic.DOCUMENT_ANALYSIS_INSTRUCTIONS,
            DOCUMENT_ANALYSIS_INSTRUCTIONS,
        )

    def test_harness_has_no_persistence_or_sensitive_content_output(self) -> None:
        source = inspect.getsource(diagnostic)
        self.assertNotIn(".commit(", source)
        self.assertNotIn(".add(", source)
        self.assertNotIn("QuestionExtractionRun", source)
        self.assertNotIn("QuestionExtractionResult", source)
        self.assertNotIn("QuestionCandidate", source)
        self.assertNotIn("raw_text", inspect.getsource(diagnostic.main))
        self.assertNotIn("API_KEY}", source)


if __name__ == "__main__":
    unittest.main()
