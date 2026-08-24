from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Literal, Protocol

from sqlalchemy.orm import Session

from app.services.openai_document_analysis_provider import (
    OpenAIDocumentAnalysisProvider,
)
from app.services.document_analysis_provider import DocumentAnalysisProvider
from app.services.pdf_raw_document_extractor import PdfRawDocumentExtractor
from app.services.question_extraction_analysis_result_service import (
    QuestionExtractionAnalysisResultService,
)
from app.services.question_extraction_document_analysis_execution_service import (
    DatabaseAnalysisResultPresenceResolver,
    DatabaseSourceDocumentPageIdentityResolver,
    QuestionExtractionDocumentAnalysisExecutionService,
)
from app.services.question_extraction_execution_service import (
    QuestionExtractionExecutionService,
)
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorSelector,
)
from app.services.question_extraction_service import QuestionExtractionService
from app.services.question_extraction_source_service import (
    QuestionExtractionSourceService,
)


QuestionExtractionExecutionMode = Literal["legacy", "document_analysis"]
ProcessorSelectorFactory = Callable[[], QuestionExtractionProcessorSelector]
DocumentAnalysisProviderFactory = Callable[[], DocumentAnalysisProvider]


class QuestionExtractionExecutionStrategy(Protocol):
    def execute_run(self, *, run_id: uuid.UUID): ...


def build_question_extraction_execution_strategy(
    db: Session,
    *,
    execution_mode: QuestionExtractionExecutionMode,
    selector_factory: ProcessorSelectorFactory,
    document_analysis_provider_factory: DocumentAnalysisProviderFactory = (
        OpenAIDocumentAnalysisProvider
    ),
) -> QuestionExtractionExecutionStrategy:
    """Compose one explicitly selected extraction strategy."""

    if execution_mode == "legacy":
        return QuestionExtractionExecutionService(
            db,
            processor_selector=selector_factory(),
        )
    if execution_mode == "document_analysis":
        lifecycle_service = QuestionExtractionService(db)
        return QuestionExtractionDocumentAnalysisExecutionService(
            lifecycle_service=lifecycle_service,
            source_service=QuestionExtractionSourceService(db),
            page_identity_resolver=DatabaseSourceDocumentPageIdentityResolver(db),
            result_presence_resolver=DatabaseAnalysisResultPresenceResolver(db),
            raw_document_extractor=PdfRawDocumentExtractor(),
            provider=document_analysis_provider_factory(),
            result_service=QuestionExtractionAnalysisResultService(db),
        )
    raise ValueError("Question extraction execution mode is invalid.")
