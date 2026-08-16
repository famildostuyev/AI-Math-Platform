from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import QuestionDifficulty, QuestionRevisionStatus


class StrictQuestionBankSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuestionBankSort(str, Enum):
    UPDATED_DESC = "updated_desc"
    CREATED_DESC = "created_desc"


class QuestionBankListQuery(StrictQuestionBankSchema):
    q: str | None = Field(default=None, max_length=200)
    question_type_id: uuid.UUID | None = None
    status: QuestionRevisionStatus | None = None
    difficulty: QuestionDifficulty | None = None
    purpose_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)
    sort: QuestionBankSort = QuestionBankSort.UPDATED_DESC

    @field_validator("q", mode="before")
    @classmethod
    def normalize_search(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None


class QuestionBankQuestionTypeRead(StrictQuestionBankSchema):
    id: uuid.UUID
    name: str
    display_name: str


class QuestionBankPrimaryTopicRead(StrictQuestionBankSchema):
    id: uuid.UUID
    name: str
    display_name: str


class QuestionBankSourceRead(StrictQuestionBankSchema):
    id: uuid.UUID
    name: str
    display_name: str
    detail: str | None


class QuestionBankItemRead(StrictQuestionBankSchema):
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    revision_id: uuid.UUID
    revision_number: int
    status: QuestionRevisionStatus
    is_current_approved: bool
    question_type: QuestionBankQuestionTypeRead
    difficulty: QuestionDifficulty | None
    primary_topic: QuestionBankPrimaryTopicRead | None
    source: QuestionBankSourceRead | None
    block_count: int = Field(ge=0)
    text_preview: str | None
    updated_at: datetime


class QuestionBankPageRead(StrictQuestionBankSchema):
    items: list[QuestionBankItemRead]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)
