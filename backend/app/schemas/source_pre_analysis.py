from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)


class StrictSourcePreAnalysisSchema(BaseModel):
    """Strict public transport base for source pre-analysis responses."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)


class SourcePreAnalysisRunRead(StrictSourcePreAnalysisSchema):
    id: uuid.UUID
    source_document_id: uuid.UUID
    run_number: int
    status: SourcePreAnalysisRunStatus
    requested_by_user_id: uuid.UUID | None
    started_at: datetime | None
    completed_at: datetime | None
    failure_message: str | None


class SourcePreAnalysisFindingRead(StrictSourcePreAnalysisSchema):
    id: uuid.UUID
    sequence_number: int
    finding_code: str
    severity: SourcePreAnalysisFindingSeverity
    confidence: Decimal | None
    message: str
    source_document_page_id: uuid.UUID | None
    page_number: int | None


class SourcePreAnalysisSuccessfulResultRead(StrictSourcePreAnalysisSchema):
    run: SourcePreAnalysisRunRead
    result_id: uuid.UUID
    schema_version: int
    page_count: int | None
    finding_count: int
    info_count: int
    warning_count: int
    error_count: int
    findings: list[SourcePreAnalysisFindingRead]


class SourcePreAnalysisOverviewRead(StrictSourcePreAnalysisSchema):
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    question_source_id: uuid.UUID | None
    uploaded_by_user_id: uuid.UUID | None
    latest_run: SourcePreAnalysisRunRead | None
    latest_successful_result: SourcePreAnalysisSuccessfulResultRead | None
