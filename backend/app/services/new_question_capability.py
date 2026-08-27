from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import AnswerPolicy, QuestionDifficulty
from app.schemas.structured_text import StructuredTextDocument, project_source_text
from app.services.authoring_action import FormulaAuthoringPayload, TextAuthoringPayload


class NewQuestionGenerationMode(str, Enum):
    SIMILAR = "similar"


_BLOCK_KEY = re.compile(r"^block_[1-9][0-9]*$")
_OPTION_KEY = re.compile(r"^option_[1-9][0-9]*$")
_CANONICAL_LABEL = re.compile(r"^[A-Z]$")


class StrictNewQuestionModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class NewQuestionTextBlock(StrictNewQuestionModel):
    block_type: Literal["text"]
    local_key: str
    payload: TextAuthoringPayload

    @field_validator("local_key")
    @classmethod
    def valid_key(cls, value: str) -> str:
        if not _BLOCK_KEY.fullmatch(value):
            raise ValueError("Text block local_key is invalid.")
        return value


class NewQuestionFormulaBlock(StrictNewQuestionModel):
    block_type: Literal["formula"]
    local_key: str
    payload: FormulaAuthoringPayload

    @field_validator("local_key")
    @classmethod
    def valid_key(cls, value: str) -> str:
        if not _BLOCK_KEY.fullmatch(value):
            raise ValueError("Formula block local_key is invalid.")
        return value


NewQuestionContentBlock = Annotated[
    Union[NewQuestionTextBlock, NewQuestionFormulaBlock],
    Field(discriminator="block_type"),
]


class NewQuestionAnswerOption(StrictNewQuestionModel):
    local_key: str
    label: str
    document: StructuredTextDocument
    format_version: Literal[1] = 1

    @field_validator("local_key")
    @classmethod
    def valid_key(cls, value: str) -> str:
        if not _OPTION_KEY.fullmatch(value):
            raise ValueError("Answer option local_key is invalid.")
        return value

    @field_validator("label")
    @classmethod
    def canonical_label(cls, value: str) -> str:
        if not _CANONICAL_LABEL.fullmatch(value):
            raise ValueError("Answer option label must be one uppercase letter.")
        return value

    @model_validator(mode="after")
    def nonempty_content(self) -> "NewQuestionAnswerOption":
        if not project_source_text(self.document).strip():
            raise ValueError("Answer option content must not be empty.")
        return self


class NewQuestionProposalPayload(StrictNewQuestionModel):
    """Typed output for question.create_new V1; no canonical target IDs exist."""

    schema_version: Literal[1] = 1
    generation_mode: Literal[NewQuestionGenerationMode.SIMILAR]
    source_revision_id: uuid.UUID
    question_type_id: uuid.UUID
    answer_policy: Literal[AnswerPolicy.OPTION_SINGLE]
    content_blocks: tuple[NewQuestionContentBlock, ...] = Field(min_length=1)
    answer_options: tuple[NewQuestionAnswerOption, ...] = Field(min_length=2)
    correct_option_key: str
    primary_topic_id: uuid.UUID | None = None
    related_topic_ids: tuple[uuid.UUID, ...] = ()
    purpose_ids: tuple[uuid.UUID, ...] = ()
    difficulty: QuestionDifficulty | None = None

    @model_validator(mode="after")
    def validate_aggregate(self) -> "NewQuestionProposalPayload":
        if any(
            isinstance(item, NewQuestionTextBlock)
            and not project_source_text(item.payload.document).strip()
            for item in self.content_blocks
        ):
            raise ValueError("Question text block content must not be empty.")
        block_keys = [item.local_key for item in self.content_blocks]
        if block_keys != [f"block_{index}" for index in range(1, len(block_keys) + 1)]:
            raise ValueError("Content block keys must be unique and sequential in source order.")
        option_keys = [item.local_key for item in self.answer_options]
        if option_keys != [f"option_{index}" for index in range(1, len(option_keys) + 1)]:
            raise ValueError("Answer option keys must be unique and sequential in source order.")
        labels = [item.label for item in self.answer_options]
        if len(labels) != len(set(labels)):
            raise ValueError("Answer option labels must be unique.")
        normalized_options = [_normalize_text(project_source_text(item.document)) for item in self.answer_options]
        if len(normalized_options) != len(set(normalized_options)):
            raise ValueError("Answer option content must be unique.")
        if self.correct_option_key not in option_keys:
            raise ValueError("Correct option must reference one proposed option.")
        if len(self.related_topic_ids) != len(set(self.related_topic_ids)):
            raise ValueError("related_topic_ids must be unique.")
        if len(self.purpose_ids) != len(set(self.purpose_ids)):
            raise ValueError("purpose_ids must be unique.")
        if self.primary_topic_id in self.related_topic_ids:
            raise ValueError("Primary topic cannot also be a related topic.")
        return self


def new_question_fingerprint(payload: NewQuestionProposalPayload) -> str:
    content: list[dict[str, str]] = []
    for block in payload.content_blocks:
        if isinstance(block, NewQuestionTextBlock):
            content.append({"type": "text", "value": _normalize_text(project_source_text(block.payload.document))})
        else:
            content.append({"type": "formula", "value": _normalize_latex(block.payload.source_latex)})
    canonical = {
        "answer_policy": payload.answer_policy.value,
        "content": content,
        "options": [_normalize_text(project_source_text(option.document)) for option in payload.answer_options],
    }
    encoded = json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _normalize_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def _normalize_latex(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).split())
