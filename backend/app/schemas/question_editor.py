from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import (
    ContentBlockType,
    QuestionDifficulty,
    QuestionRevisionStatus,
)
from app.schemas.structured_text import StructuredTextDocument


class StrictEditorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _require_unique_ids(values: list[uuid.UUID], field_name: str) -> list[uuid.UUID]:
    if len(values) != len(set(values)):
        raise ValueError(f"{field_name} must contain unique IDs.")
    return values


def _require_aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Concurrency timestamp must include a timezone.")
    return value


class QuestionDraftCreate(StrictEditorSchema):
    question_type_id: uuid.UUID
    primary_topic_id: uuid.UUID | None = None
    related_topic_ids: list[uuid.UUID] = Field(default_factory=list)
    purpose_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("related_topic_ids")
    @classmethod
    def validate_related_topic_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "related_topic_ids")

    @field_validator("purpose_ids")
    @classmethod
    def validate_purpose_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "purpose_ids")

    @model_validator(mode="after")
    def reject_primary_topic_as_related(self) -> "QuestionDraftCreate":
        if (
            self.primary_topic_id is not None
            and self.primary_topic_id in self.related_topic_ids
        ):
            raise ValueError("Primary topic cannot also be a related topic.")
        return self


class QuestionDraftRead(StrictEditorSchema):
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    revision_id: uuid.UUID
    revision_number: int = Field(gt=0)
    status: QuestionRevisionStatus
    question_type_id: uuid.UUID
    primary_topic_id: uuid.UUID | None
    related_topic_ids: list[uuid.UUID]
    purpose_ids: list[uuid.UUID]
    difficulty: QuestionDifficulty | None
    updated_at: datetime

    @field_validator("updated_at")
    @classmethod
    def validate_updated_at(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)


class TextBlockPayloadRead(StrictEditorSchema):
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class FormulaBlockPayloadRead(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1]


class ImageBlockPayloadRead(StrictEditorSchema):
    media_asset_id: uuid.UUID
    alt_text: str | None


class GeometryBlockPayloadRead(StrictEditorSchema):
    source_data: dict[str, object]
    format_version: Literal[1]


class TextBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.TEXT]
    sort_order: int = Field(ge=0)
    payload: TextBlockPayloadRead


class FormulaBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.FORMULA]
    sort_order: int = Field(ge=0)
    payload: FormulaBlockPayloadRead


class ImageBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.IMAGE]
    sort_order: int = Field(ge=0)
    payload: ImageBlockPayloadRead


class GeometryBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.GEOMETRY]
    sort_order: int = Field(ge=0)
    payload: GeometryBlockPayloadRead


ContentBlockRead = Annotated[
    Union[TextBlockRead, FormulaBlockRead, ImageBlockRead, GeometryBlockRead],
    Field(discriminator="block_type"),
]


class QuestionRevisionEditorRead(QuestionDraftRead):
    blocks: list[ContentBlockRead]


class TextBlockWritePayload(StrictEditorSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1


class FormulaBlockWritePayload(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1] = 1


class TextBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.TEXT]
    payload: TextBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class FormulaBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.FORMULA]
    payload: FormulaBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


ContentBlockCreate = Annotated[
    Union[TextBlockCreate, FormulaBlockCreate],
    Field(discriminator="block_type"),
]


class TextBlockUpdate(StrictEditorSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class FormulaBlockUpdate(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1] = 1
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


ContentBlockUpdate = Union[TextBlockUpdate, FormulaBlockUpdate]


class BlockOrderRequest(StrictEditorSchema):
    block_ids: list[uuid.UUID]
    expected_revision_updated_at: datetime

    @field_validator("block_ids")
    @classmethod
    def validate_block_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "block_ids")

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)
