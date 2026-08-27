from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.services.admin_ai_orchestrator import ADMIN_AI_MAX_INSTRUCTION_CHARS


class AdminAIQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    current_revision_id: uuid.UUID | None = None
