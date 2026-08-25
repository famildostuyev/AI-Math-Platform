from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.enums import QuestionRevisionStatus
from app.models.ai_authoring_message import AIAuthoringMessage
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.services.ai_authoring_conversation_service import (
    AIAuthoringConversationService,
)
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalRevisionConflictError,
    AIAuthoringProposalService,
)
from app.services.authoring_assistant_provider import AuthoringAssistantProvider
from app.services.question_authoring_context import QuestionAuthoringContextService


class AIAuthoringTurnServiceError(Exception):
    pass


class AIAuthoringTurnRevisionNotEditableError(AIAuthoringTurnServiceError):
    pass


class AIAuthoringTurnStaleContextError(AIAuthoringTurnServiceError):
    pass


@dataclass(frozen=True)
class AIAuthoringTurnResult:
    user_message: AIAuthoringMessage
    proposal: AIAuthoringProposal


class AIAuthoringTurnService:
    def __init__(
        self,
        db: Session,
        *,
        provider: AuthoringAssistantProvider,
    ) -> None:
        self.db = db
        self.provider = provider

    def submit_user_turn(
        self,
        *,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        instruction: str,
    ) -> AIAuthoringTurnResult:
        """Persist one input, call the provider lock-free, then snapshot a proposal."""

        conversation_service = AIAuthoringConversationService(self.db)
        user_message = conversation_service.add_user_message(
            conversation_id=conversation_id,
            user_id=user_id,
            content=instruction,
        )
        try:
            context = QuestionAuthoringContextService(self.db).build_for_conversation(
                conversation_id=conversation_id
            )
        finally:
            # End the read-only context transaction before validation/provider work.
            self.db.rollback()
        if context.revision_status != QuestionRevisionStatus.DRAFT:
            raise AIAuthoringTurnRevisionNotEditableError(
                "Conversation revision is not editable."
            )

        assistant_result = self.provider.propose_actions(
            instruction=user_message.content,
            context=context,
        )
        try:
            proposal = AIAuthoringProposalService(self.db).create_pending_proposal(
                source_revision_id=context.revision_id,
                expected_revision_updated_at=context.revision_updated_at,
                action_envelope=assistant_result.action_envelope,
                provider_name=assistant_result.provider_name,
                model_name=assistant_result.model_name,
                prompt_version=assistant_result.prompt_version,
                provider_schema_version=assistant_result.provider_schema_version,
                requested_by_user_id=user_id,
                request_message_id=user_message.id,
            )
        except AIAuthoringProposalRevisionConflictError as exc:
            raise AIAuthoringTurnStaleContextError(
                "Question revision changed while the AI turn was running."
            ) from exc
        return AIAuthoringTurnResult(
            user_message=user_message,
            proposal=proposal,
        )
