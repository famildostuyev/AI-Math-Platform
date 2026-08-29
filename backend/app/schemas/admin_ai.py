from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

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
