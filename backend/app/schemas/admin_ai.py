from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.admin_ai_orchestrator import (
    ADMIN_AI_MAX_INSTRUCTION_CHARS,
    AdminAIConversationContext,
    AdminAIGeneratedDraft,
)


class AdminAIQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    current_revision_id: uuid.UUID | None = None
    conversation_context: AdminAIConversationContext | None = None


class AdminAIReplacementProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_revision_id: uuid.UUID
    generated_draft: AdminAIGeneratedDraft


class AdminAIReplacementProposalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proposal_id: uuid.UUID
    proposal_status: Literal["pending"]


class AdminAIQuestionDraftPromotionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: uuid.UUID
    draft_status: Literal["promoted"]
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    revision_id: uuid.UUID


ADMIN_AI_SIMILAR_QUESTION_MAX_COUNT = 20


class AdminAISimilarQuestionGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_revision_id: uuid.UUID
    requested_count: int = Field(gt=0, le=ADMIN_AI_SIMILAR_QUESTION_MAX_COUNT)
    admin_constraints: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)

    @field_validator("admin_constraints")
    @classmethod
    def constraints_are_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Admin constraints cannot be blank.")
        return value


class AdminAISimilarQuestionDraftRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_draft: AdminAIGeneratedDraft
    persistent_draft_id: uuid.UUID
    persistent_draft_status: Literal["active"]


class AdminAISimilarQuestionGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_count: int
    items: tuple[AdminAISimilarQuestionDraftRead, ...]
