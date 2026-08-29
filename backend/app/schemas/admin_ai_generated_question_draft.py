from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.core.enums import AdminAIGeneratedQuestionDraftStatus
from app.services.admin_ai_orchestrator import (
    AdminAIAssistantContent,
    AdminAIDraftAnswerOption,
    AdminAIGeneratedDraft,
)


class AdminAIGeneratedQuestionDraftCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_draft: AdminAIGeneratedDraft
    source_revision_id: uuid.UUID | None = None


class AdminAIGeneratedQuestionDraftRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    source_revision_id: uuid.UUID | None
    status: AdminAIGeneratedQuestionDraftStatus
    draft_kind: Literal["question", "explanation", "solution", "lesson_fragment", "other"]
    format_hint: Literal["free_form", "multiple_choice"]
    title: str | None
    content: AdminAIAssistantContent
    answer_options: tuple[AdminAIDraftAnswerOption, ...]
    correct_option_labels: tuple[str, ...]
    explanation: AdminAIAssistantContent | None
    is_canonical: Literal[False]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
