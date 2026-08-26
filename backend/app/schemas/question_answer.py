from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import AnswerPolicy
from app.schemas.structured_text import StructuredTextDocument


class StrictAnswerSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Concurrency timestamp must include a timezone.")
    return value


class AnswerContentWrite(StrictAnswerSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1


class AnswerOptionCreate(AnswerContentWrite):
    label: str | None = Field(default=None, max_length=50)
    expected_revision_updated_at: datetime

    @field_validator("label")
    @classmethod
    def label_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Answer option label cannot be blank.")
        return value

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class AnswerOptionUpdate(AnswerContentWrite):
    label: str | None = Field(default=None, max_length=50)
    expected_revision_updated_at: datetime

    @field_validator("label")
    @classmethod
    def label_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Answer option label cannot be blank.")
        return value

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class AnswerOptionRead(StrictAnswerSchema):
    id: uuid.UUID
    label: str | None
    order_index: int = Field(gt=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]
    is_correct: bool


class AcceptedAnswerCreate(AnswerContentWrite):
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class AcceptedAnswerUpdate(AnswerContentWrite):
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class AcceptedAnswerRead(StrictAnswerSchema):
    id: uuid.UUID
    order_index: int = Field(gt=0)
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class AnswerOrderRequest(StrictAnswerSchema):
    answer_ids: list[uuid.UUID]
    expected_revision_updated_at: datetime

    @field_validator("answer_ids")
    @classmethod
    def ids_unique(cls, values: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(values) != len(set(values)):
            raise ValueError("answer_ids must contain unique IDs.")
        return values

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class SetCorrectOptionsRequest(StrictAnswerSchema):
    option_ids: list[uuid.UUID]
    expected_revision_updated_at: datetime

    @field_validator("option_ids")
    @classmethod
    def ids_unique(cls, values: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(values) != len(set(values)):
            raise ValueError("option_ids must contain unique IDs.")
        return values

    @field_validator("expected_revision_updated_at")
    @classmethod
    def timestamp_aware(cls, value: datetime) -> datetime:
        return _aware(value)


class RevisionAnswersRead(StrictAnswerSchema):
    answer_policy: AnswerPolicy
    answer_options: list[AnswerOptionRead]
    accepted_answers: list[AcceptedAnswerRead]
