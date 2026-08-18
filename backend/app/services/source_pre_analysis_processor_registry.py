from __future__ import annotations

from app.services.pdf_source_pre_analysis_processor import (
    PdfSourcePreAnalysisProcessor,
)
from app.services.source_pre_analysis_processor import (
    RegisteredSourcePreAnalysisProcessorSelector,
)


def build_source_pre_analysis_processor_selector(
) -> RegisteredSourcePreAnalysisProcessorSelector:
    """Build the explicit production source pre-analysis processor registry."""

    return RegisteredSourcePreAnalysisProcessorSelector(
        processors=(PdfSourcePreAnalysisProcessor(),),
    )
