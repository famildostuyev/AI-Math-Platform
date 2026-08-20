from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
