from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import (
    AIAuthoringConversationStatus,
    AIAuthoringMessageRole,
    AIAuthoringProposalStatus,
)
from app.models.ai_authoring_message import AI_AUTHORING_MESSAGE_MAX_LENGTH
from app.services.ai_authoring_proposal_preview_service import (
    AuthoringProposalPreview,
)
from app.services.authoring_action import AuthoringActionEnvelope


class StrictAuthoringApiSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class SubmitUserTurnRequest(StrictAuthoringApiSchema):
    instruction: str = Field(max_length=AI_AUTHORING_MESSAGE_MAX_LENGTH)

    @field_validator("instruction")
    @classmethod
    def validate_instruction(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Instruction must not be blank.")
        return value


class ConversationRead(StrictAuthoringApiSchema):
    id: uuid.UUID
    active_revision_id: uuid.UUID
    created_by_user_id: uuid.UUID | None
    status: AIAuthoringConversationStatus
    created_at: datetime
    updated_at: datetime


class CreateConversationResponse(ConversationRead):
    pass


class MessageRead(StrictAuthoringApiSchema):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: AIAuthoringMessageRole
    sequence_number: int = Field(gt=0)
    content: str
    created_by_user_id: uuid.UUID | None
    created_at: datetime


class ProposalRead(StrictAuthoringApiSchema):
    id: uuid.UUID
    source_revision_id: uuid.UUID
    source_revision_updated_at: datetime
    status: AIAuthoringProposalStatus
    action_envelope: AuthoringActionEnvelope
    provider_name: str
    model_name: str
    prompt_version: str
    provider_schema_version: int
    requested_by_user_id: uuid.UUID | None
    request_message_id: uuid.UUID | None
    accepted_by_user_id: uuid.UUID | None
    rejected_by_user_id: uuid.UUID | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    created_at: datetime


class SubmitUserTurnResponse(StrictAuthoringApiSchema):
    user_message: MessageRead
    proposal: ProposalRead
    preview_url: str


class ProposalPreviewRead(AuthoringProposalPreview):
    pass


class ProposalDecisionResponse(StrictAuthoringApiSchema):
    proposal_id: uuid.UUID
    status: AIAuthoringProposalStatus
    accepted_by_user_id: uuid.UUID | None
    rejected_by_user_id: uuid.UUID | None
    accepted_at: datetime | None
    rejected_at: datetime | None
