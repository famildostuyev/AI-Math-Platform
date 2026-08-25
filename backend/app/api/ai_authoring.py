from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.ai_authoring_message import AIAuthoringMessage
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.user import User
from app.schemas.ai_authoring import (
    ConversationRead,
    CreateConversationResponse,
    MessageRead,
    ProposalDecisionResponse,
    ProposalPreviewRead,
    ProposalRead,
    SubmitUserTurnRequest,
    SubmitUserTurnResponse,
)
from app.services.ai_authoring_conversation_service import (
    AIAuthoringConversationClosedError,
    AIAuthoringConversationNotFoundError,
    AIAuthoringConversationRevisionNotFoundError,
    AIAuthoringConversationService,
    AIAuthoringConversationUserNotFoundError,
    AIAuthoringMessageSequenceConflictError,
    AIAuthoringMessageValidationError,
)
from app.services.ai_authoring_proposal_preview_service import (
    AIAuthoringProposalPreviewBlockTypeError,
    AIAuthoringProposalPreviewInvalidEnvelopeError,
    AIAuthoringProposalPreviewInvalidOrderError,
    AIAuthoringProposalPreviewInvalidTargetError,
    AIAuthoringProposalPreviewNotFoundError,
    AIAuthoringProposalPreviewService,
)
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalActionApplicationError,
    AIAuthoringProposalConcurrentModificationError,
    AIAuthoringProposalDecisionMakerNotFoundError,
    AIAuthoringProposalNotFoundError,
    AIAuthoringProposalNotPendingError,
    AIAuthoringProposalObsoleteError,
    AIAuthoringProposalRevisionNotEditableError,
    AIAuthoringProposalService,
    AIAuthoringProposalValidationError,
)
from app.services.ai_authoring_turn_service import (
    AIAuthoringTurnRevisionNotEditableError,
    AIAuthoringTurnService,
    AIAuthoringTurnStaleContextError,
)
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.authoring_assistant_provider import (
    AuthoringAssistantAPIError,
    AuthoringAssistantInvalidActionTargetError,
    AuthoringAssistantInvalidContextError,
    AuthoringAssistantInvalidInstructionError,
    AuthoringAssistantInvalidResponseError,
    AuthoringAssistantNetworkError,
    AuthoringAssistantProvider,
    AuthoringAssistantRateLimitError,
    AuthoringAssistantTimeoutError,
    AuthoringAssistantUnknownProviderError,
)
from app.services.openai_authoring_assistant_provider import (
    OpenAIAuthoringAssistantProvider,
)
from app.services.question_authoring_context import (
    AuthoringContextConversationDeletedError,
    AuthoringContextConversationNotFoundError,
    AuthoringContextInvalidBlockPayloadError,
    AuthoringContextRevisionInactiveError,
    AuthoringContextRevisionNotFoundError,
    AuthoringContextTooLargeError,
)


router = APIRouter(tags=["AI Authoring"])
admin_user = Depends(require_roles(RoleName.ADMIN))


def get_authoring_assistant_provider() -> AuthoringAssistantProvider:
    return OpenAIAuthoringAssistantProvider()


def _message_read(message: AIAuthoringMessage) -> MessageRead:
    return MessageRead.model_validate(message)


def _proposal_read(proposal: AIAuthoringProposal) -> ProposalRead:
    try:
        envelope = AuthoringActionEnvelope.model_validate(proposal.actions)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stored authoring proposal is invalid.",
        ) from exc
    return ProposalRead(
        id=proposal.id,
        source_revision_id=proposal.source_revision_id,
        source_revision_updated_at=proposal.source_revision_updated_at,
        status=proposal.status,
        action_envelope=envelope,
        provider_name=proposal.provider_name,
        model_name=proposal.model_name,
        prompt_version=proposal.prompt_version,
        provider_schema_version=proposal.provider_schema_version,
        requested_by_user_id=proposal.requested_by_user_id,
        request_message_id=proposal.request_message_id,
        accepted_by_user_id=proposal.accepted_by_user_id,
        rejected_by_user_id=proposal.rejected_by_user_id,
        accepted_at=proposal.accepted_at,
        rejected_at=proposal.rejected_at,
        created_at=proposal.created_at,
    )


def _decision_read(proposal: AIAuthoringProposal) -> ProposalDecisionResponse:
    return ProposalDecisionResponse(
        proposal_id=proposal.id,
        status=proposal.status,
        accepted_by_user_id=proposal.accepted_by_user_id,
        rejected_by_user_id=proposal.rejected_by_user_id,
        accepted_at=proposal.accepted_at,
        rejected_at=proposal.rejected_at,
    )


def _map_service_error(exc: Exception) -> None:
    if isinstance(exc, (
        AIAuthoringConversationNotFoundError,
        AIAuthoringProposalNotFoundError,
        AIAuthoringProposalPreviewNotFoundError,
        AuthoringContextConversationNotFoundError,
        AuthoringContextRevisionNotFoundError,
        AIAuthoringConversationRevisionNotFoundError,
    )):
        code, detail = status.HTTP_404_NOT_FOUND, "AI authoring resource was not found."
    elif isinstance(exc, (
        AIAuthoringConversationClosedError,
        AIAuthoringMessageSequenceConflictError,
        AIAuthoringProposalNotPendingError,
        AIAuthoringProposalObsoleteError,
        AIAuthoringProposalConcurrentModificationError,
        AIAuthoringProposalRevisionNotEditableError,
        AIAuthoringTurnRevisionNotEditableError,
        AIAuthoringTurnStaleContextError,
        AuthoringContextConversationDeletedError,
        AuthoringContextRevisionInactiveError,
    )):
        code, detail = status.HTTP_409_CONFLICT, "AI authoring state conflict."
    elif isinstance(exc, AuthoringAssistantTimeoutError):
        code, detail = status.HTTP_504_GATEWAY_TIMEOUT, "AI authoring provider timed out."
    elif isinstance(exc, AuthoringAssistantRateLimitError):
        code, detail = status.HTTP_503_SERVICE_UNAVAILABLE, "AI authoring provider is unavailable."
    elif isinstance(exc, (
        AuthoringAssistantNetworkError,
        AuthoringAssistantAPIError,
        AuthoringAssistantInvalidResponseError,
        AuthoringAssistantInvalidActionTargetError,
        AuthoringAssistantUnknownProviderError,
    )):
        code, detail = status.HTTP_502_BAD_GATEWAY, "AI authoring provider failed."
    elif isinstance(exc, (
        AIAuthoringMessageValidationError,
        AIAuthoringProposalValidationError,
        AIAuthoringProposalPreviewInvalidEnvelopeError,
        AIAuthoringProposalPreviewInvalidTargetError,
        AIAuthoringProposalPreviewBlockTypeError,
        AIAuthoringProposalPreviewInvalidOrderError,
        AuthoringAssistantInvalidInstructionError,
        AuthoringAssistantInvalidContextError,
        AuthoringContextInvalidBlockPayloadError,
        AuthoringContextTooLargeError,
    )):
        code, detail = status.HTTP_422_UNPROCESSABLE_CONTENT, "AI authoring request is invalid."
    elif isinstance(exc, (
        AIAuthoringConversationUserNotFoundError,
        AIAuthoringProposalDecisionMakerNotFoundError,
        AIAuthoringProposalActionApplicationError,
    )):
        code, detail = status.HTTP_409_CONFLICT, "Authenticated Admin is unavailable."
    else:
        raise exc
    raise HTTPException(status_code=code, detail=detail) from exc


@router.post(
    "/questions/revisions/{revision_id}/ai-authoring/conversations",
    response_model=CreateConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    revision_id: uuid.UUID,
    current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> CreateConversationResponse:
    try:
        conversation = AIAuthoringConversationService(db).create_conversation(
            active_revision_id=revision_id,
            created_by_user_id=current_user.id,
        )
        return CreateConversationResponse.model_validate(conversation)
    except Exception as exc:
        _map_service_error(exc)


@router.get("/ai-authoring/conversations/{conversation_id}", response_model=ConversationRead)
def get_conversation(
    conversation_id: uuid.UUID,
    _current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationRead:
    try:
        return ConversationRead.model_validate(
            AIAuthoringConversationService(db).get_conversation(
                conversation_id=conversation_id
            )
        )
    except Exception as exc:
        _map_service_error(exc)


@router.get(
    "/ai-authoring/conversations/{conversation_id}/messages",
    response_model=list[MessageRead],
)
def list_messages(
    conversation_id: uuid.UUID,
    _current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> list[MessageRead]:
    try:
        return [
            _message_read(message)
            for message in AIAuthoringConversationService(db).list_messages(
                conversation_id=conversation_id
            )
        ]
    except Exception as exc:
        _map_service_error(exc)


@router.post(
    "/ai-authoring/conversations/{conversation_id}/messages",
    response_model=SubmitUserTurnResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_user_turn(
    conversation_id: uuid.UUID,
    request: SubmitUserTurnRequest,
    current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
    provider: Annotated[
        AuthoringAssistantProvider,
        Depends(get_authoring_assistant_provider),
    ],
) -> SubmitUserTurnResponse:
    try:
        result = AIAuthoringTurnService(db, provider=provider).submit_user_turn(
            conversation_id=conversation_id,
            user_id=current_user.id,
            instruction=request.instruction,
        )
        return SubmitUserTurnResponse(
            user_message=_message_read(result.user_message),
            proposal=_proposal_read(result.proposal),
            preview_url=f"/api/v1/ai-authoring/proposals/{result.proposal.id}/preview",
        )
    except HTTPException:
        raise
    except Exception as exc:
        _map_service_error(exc)


@router.get("/ai-authoring/proposals/{proposal_id}", response_model=ProposalRead)
def get_proposal(
    proposal_id: uuid.UUID,
    _current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ProposalRead:
    try:
        return _proposal_read(
            AIAuthoringProposalService(db).get_proposal(proposal_id=proposal_id)
        )
    except HTTPException:
        raise
    except Exception as exc:
        _map_service_error(exc)


@router.get("/ai-authoring/proposals/{proposal_id}/preview", response_model=ProposalPreviewRead)
def get_proposal_preview(
    proposal_id: uuid.UUID,
    _current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ProposalPreviewRead:
    try:
        preview = AIAuthoringProposalPreviewService(db).build_preview(
            proposal_id=proposal_id
        )
        return ProposalPreviewRead.model_validate(preview.model_dump())
    except Exception as exc:
        _map_service_error(exc)


@router.post(
    "/ai-authoring/proposals/{proposal_id}/accept",
    response_model=ProposalDecisionResponse,
)
def accept_proposal(
    proposal_id: uuid.UUID,
    current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ProposalDecisionResponse:
    try:
        return _decision_read(
            AIAuthoringProposalService(db).accept_proposal(
                proposal_id=proposal_id,
                accepted_by_user_id=current_user.id,
            )
        )
    except Exception as exc:
        _map_service_error(exc)


@router.post(
    "/ai-authoring/proposals/{proposal_id}/reject",
    response_model=ProposalDecisionResponse,
)
def reject_proposal(
    proposal_id: uuid.UUID,
    current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ProposalDecisionResponse:
    try:
        return _decision_read(
            AIAuthoringProposalService(db).reject_proposal(
                proposal_id=proposal_id,
                rejected_by_user_id=current_user.id,
            )
        )
    except Exception as exc:
        _map_service_error(exc)


@router.post(
    "/ai-authoring/conversations/{conversation_id}/close",
    response_model=ConversationRead,
)
def close_conversation(
    conversation_id: uuid.UUID,
    current_user: Annotated[User, admin_user],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationRead:
    try:
        return ConversationRead.model_validate(
            AIAuthoringConversationService(db).close_conversation(
                conversation_id=conversation_id,
                closed_by_user_id=current_user.id,
            )
        )
    except Exception as exc:
        _map_service_error(exc)
