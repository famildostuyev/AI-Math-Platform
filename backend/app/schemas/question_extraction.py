from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import QuestionExtractionRunStatus


class StrictQuestionExtractionSchema(BaseModel):
    """Strict public transport base for question extraction responses."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)


class QuestionExtractionRunRead(StrictQuestionExtractionSchema):
    id: uuid.UUID
    source_document_id: uuid.UUID
    run_number: int
    status: QuestionExtractionRunStatus
    requested_by_user_id: uuid.UUID | None
    started_at: datetime | None
    completed_at: datetime | None
    failure_message: str | None


class QuestionCandidateRead(StrictQuestionExtractionSchema):
    id: uuid.UUID
    sequence_number: int
    extracted_text: str
    confidence: Decimal | None
    source_document_page_id: uuid.UUID | None
    page_number: int | None


class QuestionExtractionAnalysisPageRead(StrictQuestionExtractionSchema):
    source_document_page_id: uuid.UUID
    page_number: int


class QuestionExtractionTextSegmentRead(StrictQuestionExtractionSchema):
    type: Literal["text"]
    text: str


class QuestionExtractionMathSegmentRead(StrictQuestionExtractionSchema):
    type: Literal["math"]
    latex: str
    source_text: str
    display_mode: bool


QuestionExtractionContentSegmentRead = Annotated[
    QuestionExtractionTextSegmentRead | QuestionExtractionMathSegmentRead,
    Field(discriminator="type"),
]


class QuestionExtractionStructuredContentRead(StrictQuestionExtractionSchema):
    format_version: Literal[1]
    segments: list[QuestionExtractionContentSegmentRead] = Field(min_length=1)


class QuestionExtractionAnalysisOptionRead(StrictQuestionExtractionSchema):
    label: str | None
    text: str
    content: QuestionExtractionStructuredContentRead | None = None


class QuestionExtractionAnalysisCorrectionRead(StrictQuestionExtractionSchema):
    original_value: str
    normalized_value: str
    reason: str


class QuestionExtractionAnalysisQuestionRead(StrictQuestionExtractionSchema):
    id: uuid.UUID
    sequence_number: int
    question_number: str | None
    variant: str | None
    source_pages: list[QuestionExtractionAnalysisPageRead]
    question_text: str
    content: QuestionExtractionStructuredContentRead | None = None
    answer_options: list[QuestionExtractionAnalysisOptionRead]
    confidence: Decimal = Field(ge=0, le=1)
    needs_review: bool
    corrections: list[QuestionExtractionAnalysisCorrectionRead]
    visual_required: bool


class QuestionExtractionAnalysisBlockRead(StrictQuestionExtractionSchema):
    name: str
    question_count: int


class QuestionExtractionAnalysisRead(StrictQuestionExtractionSchema):
    detected_language: str | None
    total_questions: int
    blocks: list[QuestionExtractionAnalysisBlockRead]
    needs_review_count: int
    corrections_count: int
    visual_required_count: int
    multi_page_question_count: int
    questions: list[QuestionExtractionAnalysisQuestionRead]


class QuestionExtractionAnalysisResultRead(StrictQuestionExtractionSchema):
    run_id: uuid.UUID
    schema_version: int
    processor_name: str
    processor_version: str
    provider_name: str | None
    model_name: str | None
    prompt_version: str | None
    processing_version: str
    analysis: QuestionExtractionAnalysisRead


class QuestionExtractionSuccessfulResultRead(
    StrictQuestionExtractionSchema
):
    run: QuestionExtractionRunRead
    candidate_count: int
    candidates: list[QuestionCandidateRead]
    analysis_result: QuestionExtractionAnalysisResultRead | None = None


class QuestionExtractionOverviewRead(StrictQuestionExtractionSchema):
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    question_source_id: uuid.UUID | None
    uploaded_by_user_id: uuid.UUID | None
    latest_run: QuestionExtractionRunRead | None
    latest_successful_result: QuestionExtractionSuccessfulResultRead | None
