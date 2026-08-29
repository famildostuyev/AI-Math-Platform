from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import SolutionBlockType, SolutionPresentationRole
from app.schemas.structured_text import StructuredTextDocument


class StrictSolutionSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Concurrency timestamp must include a timezone.")
    return value


class SolutionCreate(StrictSolutionSchema):
    expected_revision_updated_at: datetime
    _timestamp = field_validator("expected_revision_updated_at")(_aware)


class SolutionDelete(SolutionCreate):
    pass


class SolutionTextPayload(StrictSolutionSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1


class SolutionFormulaPayload(StrictSolutionSchema):
    source_latex: str = Field(min_length=1)
    format_version: Literal[1] = 1


class SolutionTextBlockCreate(SolutionCreate):
    block_type: Literal[SolutionBlockType.TEXT]
    payload: SolutionTextPayload
    step_index: int | None = Field(default=None, ge=1)
    presentation_role: SolutionPresentationRole = SolutionPresentationRole.REASONING


class SolutionFormulaBlockCreate(SolutionCreate):
    block_type: Literal[SolutionBlockType.FORMULA]
    payload: SolutionFormulaPayload
    step_index: int | None = Field(default=None, ge=1)
    presentation_role: SolutionPresentationRole = SolutionPresentationRole.REASONING


class SolutionTextBlockUpdate(SolutionCreate):
    payload: SolutionTextPayload


class SolutionFormulaBlockUpdate(SolutionCreate):
    payload: SolutionFormulaPayload


class SolutionBlockOrderRequest(SolutionCreate):
    block_ids: list[uuid.UUID] = Field(min_length=1)

    @field_validator("block_ids")
    @classmethod
    def unique_ids(cls, values: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(values) != len(set(values)):
            raise ValueError("block_ids must contain unique IDs.")
        return values


class SolutionTextBlockRead(StrictSolutionSchema):
    id: uuid.UUID
    block_type: Literal[SolutionBlockType.TEXT]
    sort_order: int = Field(gt=0)
    step_index: int | None = Field(default=None, ge=1)
    presentation_role: SolutionPresentationRole = SolutionPresentationRole.REASONING
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class SolutionFormulaBlockRead(StrictSolutionSchema):
    id: uuid.UUID
    block_type: Literal[SolutionBlockType.FORMULA]
    sort_order: int = Field(gt=0)
    step_index: int | None = Field(default=None, ge=1)
    presentation_role: SolutionPresentationRole = SolutionPresentationRole.REASONING
    source_latex: str
    format_version: Literal[1]


SolutionBlockRead = Annotated[
    Union[SolutionTextBlockRead, SolutionFormulaBlockRead],
    Field(discriminator="block_type"),
]


class SolutionRead(StrictSolutionSchema):
    id: uuid.UUID
    blocks: list[SolutionBlockRead]
