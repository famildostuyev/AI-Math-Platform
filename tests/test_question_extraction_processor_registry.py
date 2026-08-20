from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.services.pdf_question_extraction_processor import (
    PDF_MIME_TYPE,
    PdfQuestionExtractionProcessor,
)
from app.services.question_extraction_processor import (
    QuestionExtractionUnsupportedMimeError,
    RegisteredQuestionExtractionProcessorSelector,
)
from app.services.question_extraction_processor_registry import (
    build_question_extraction_processor_selector,
)


class QuestionExtractionProcessorRegistryTest(unittest.TestCase):
    def test_registry_builds_registered_selector_with_pdf_processor(self) -> None:
        selector = build_question_extraction_processor_selector()

        self.assertIsInstance(
            selector,
            RegisteredQuestionExtractionProcessorSelector,
        )

        processor = selector.select(mime_type=PDF_MIME_TYPE)
        self.assertIsInstance(processor, PdfQuestionExtractionProcessor)

    def test_registry_does_not_claim_unregistered_mime_types(self) -> None:
        selector = build_question_extraction_processor_selector()

        for mime_type in (
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document",
        ):
            with self.subTest(mime_type=mime_type), self.assertRaises(
                QuestionExtractionUnsupportedMimeError
            ):
                selector.select(mime_type=mime_type)

    def test_registry_is_explicit_and_has_no_dynamic_discovery(self) -> None:
        module = Path(
            BACKEND_DIR
            / "app/services/question_extraction_processor_registry.py"
        ).read_text(encoding="utf-8")

        self.assertIn("PdfQuestionExtractionProcessor", module)
        for forbidden in (
            "pkgutil",
            "importlib",
            "glob(",
            "rglob(",
            "os.walk",
            "__subclasses__",
        ):
            self.assertNotIn(forbidden, module)


if __name__ == "__main__":
    unittest.main()
