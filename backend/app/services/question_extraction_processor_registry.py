from __future__ import annotations

from app.services.pdf_question_extraction_processor import (
    PdfQuestionExtractionProcessor,
)
from app.services.question_extraction_processor import (
    RegisteredQuestionExtractionProcessorSelector,
)


def build_question_extraction_processor_selector(
) -> RegisteredQuestionExtractionProcessorSelector:
    """Build the explicit production question extraction processor registry."""

    return RegisteredQuestionExtractionProcessorSelector(
        processors=(
            PdfQuestionExtractionProcessor(),
        ),
    )
