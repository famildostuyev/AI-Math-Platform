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


class CreateAnswerOptionAction(StrictAuthoringActionModel):
    action_type: Literal["create_answer_option"]
    label: str | None
    payload: TextAuthoringPayload


class UpdateAnswerOptionAction(StrictAuthoringActionModel):
    action_type: Literal["update_answer_option"]
    option_id: uuid.UUID
    label: str | None
    payload: TextAuthoringPayload


class DeleteAnswerOptionAction(StrictAuthoringActionModel):
    action_type: Literal["delete_answer_option"]
    option_id: uuid.UUID


class ReorderAnswerOptionsAction(StrictAuthoringActionModel):
    action_type: Literal["reorder_answer_options"]
    ordered_option_ids: list[uuid.UUID]

    @field_validator("ordered_option_ids")
    @classmethod
    def unique_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("ordered_option_ids must contain unique IDs.")
        return value


class SetCorrectAnswersAction(StrictAuthoringActionModel):
    action_type: Literal["set_correct_answers"]
    option_ids: list[uuid.UUID]

    @field_validator("option_ids")
    @classmethod
    def unique_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("option_ids must contain unique IDs.")
        return value


class CreateAcceptedAnswerAction(StrictAuthoringActionModel):
    action_type: Literal["create_accepted_answer"]
    payload: TextAuthoringPayload


class UpdateAcceptedAnswerAction(StrictAuthoringActionModel):
    action_type: Literal["update_accepted_answer"]
    answer_id: uuid.UUID
    payload: TextAuthoringPayload


class DeleteAcceptedAnswerAction(StrictAuthoringActionModel):
    action_type: Literal["delete_accepted_answer"]
    answer_id: uuid.UUID


class ReorderAcceptedAnswersAction(StrictAuthoringActionModel):
    action_type: Literal["reorder_accepted_answers"]
    ordered_answer_ids: list[uuid.UUID]

    @field_validator("ordered_answer_ids")
    @classmethod
    def unique_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("ordered_answer_ids must contain unique IDs.")
        return value


class CreateSolutionAction(StrictAuthoringActionModel):
    action_type: Literal["create_solution"]


class DeleteSolutionAction(StrictAuthoringActionModel):
    action_type: Literal["delete_solution"]


class CreateSolutionTextBlockAction(StrictAuthoringActionModel):
    action_type: Literal["create_solution_text_block"]
    payload: TextAuthoringPayload


class UpdateSolutionTextBlockAction(StrictAuthoringActionModel):
    action_type: Literal["update_solution_text_block"]
    solution_block_id: uuid.UUID
    payload: TextAuthoringPayload


class CreateSolutionFormulaBlockAction(StrictAuthoringActionModel):
    action_type: Literal["create_solution_formula_block"]
    payload: FormulaAuthoringPayload


class UpdateSolutionFormulaBlockAction(StrictAuthoringActionModel):
    action_type: Literal["update_solution_formula_block"]
    solution_block_id: uuid.UUID
    payload: FormulaAuthoringPayload


class DeleteSolutionBlockAction(StrictAuthoringActionModel):
    action_type: Literal["delete_solution_block"]
    solution_block_id: uuid.UUID


class ReorderSolutionBlocksAction(StrictAuthoringActionModel):
    action_type: Literal["reorder_solution_blocks"]
    ordered_solution_block_ids: list[uuid.UUID]

    @field_validator("ordered_solution_block_ids")
    @classmethod
    def unique_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("ordered_solution_block_ids must contain unique IDs.")
        return value


AuthoringAction = Annotated[
    Union[
        UpdateTextBlockAction,
        UpdateFormulaBlockAction,
        CreateTextBlockAction,
        CreateFormulaBlockAction,
        DeleteBlockAction,
        ReorderBlockAction,
        CreateAnswerOptionAction,
        UpdateAnswerOptionAction,
        DeleteAnswerOptionAction,
        ReorderAnswerOptionsAction,
        SetCorrectAnswersAction,
        CreateAcceptedAnswerAction,
        UpdateAcceptedAnswerAction,
        DeleteAcceptedAnswerAction,
        ReorderAcceptedAnswersAction,
        CreateSolutionAction,
        DeleteSolutionAction,
        CreateSolutionTextBlockAction,
        UpdateSolutionTextBlockAction,
        CreateSolutionFormulaBlockAction,
        UpdateSolutionFormulaBlockAction,
        DeleteSolutionBlockAction,
        ReorderSolutionBlocksAction,
    ],
    Field(discriminator="action_type"),
]


class AuthoringActionEnvelope(StrictAuthoringActionModel):
    schema_version: Literal[1] = 1
    actions: list[AuthoringAction] = Field(min_length=1)
