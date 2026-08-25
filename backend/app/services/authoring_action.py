from __future__ import annotations

import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.structured_text import StructuredTextDocument


class StrictAuthoringActionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextAuthoringPayload(StrictAuthoringActionModel):
    document: StructuredTextDocument
    format_version: Literal[1] = 1


class FormulaAuthoringPayload(StrictAuthoringActionModel):
    source_latex: str
    format_version: Literal[1] = 1

    @field_validator("source_latex")
    @classmethod
    def validate_source_latex(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Formula source_latex cannot be blank.")
        return value


class UpdateTextBlockAction(StrictAuthoringActionModel):
    action_type: Literal["update_text_block"]
    block_id: uuid.UUID
    payload: TextAuthoringPayload


class UpdateFormulaBlockAction(StrictAuthoringActionModel):
    action_type: Literal["update_formula_block"]
    block_id: uuid.UUID
    payload: FormulaAuthoringPayload


class CreateTextBlockAction(StrictAuthoringActionModel):
    action_type: Literal["create_text_block"]
    payload: TextAuthoringPayload


class CreateFormulaBlockAction(StrictAuthoringActionModel):
    action_type: Literal["create_formula_block"]
    payload: FormulaAuthoringPayload


class DeleteBlockAction(StrictAuthoringActionModel):
    action_type: Literal["delete_block"]
    block_id: uuid.UUID


class ReorderBlockAction(StrictAuthoringActionModel):
    action_type: Literal["reorder_blocks"]
    ordered_block_ids: list[uuid.UUID] = Field(min_length=1)

    @field_validator("ordered_block_ids")
    @classmethod
    def validate_ordered_block_ids(
        cls,
        value: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("ordered_block_ids must contain unique IDs.")
        return value


AuthoringAction = Annotated[
    Union[
        UpdateTextBlockAction,
        UpdateFormulaBlockAction,
        CreateTextBlockAction,
        CreateFormulaBlockAction,
        DeleteBlockAction,
        ReorderBlockAction,
    ],
    Field(discriminator="action_type"),
]


class AuthoringActionEnvelope(StrictAuthoringActionModel):
    schema_version: Literal[1] = 1
    actions: list[AuthoringAction] = Field(min_length=1)
