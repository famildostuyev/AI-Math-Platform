from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.enums import AIAuthoringMessageRole, AIAuthoringProposalStatus
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.models.ai_authoring_message import AIAuthoringMessage
from app.models.question_revision import QuestionRevision
from app.models.user import User
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.question_editor_service import (
    QuestionEditorService,
    QuestionEditorServiceError,
    RevisionConflictError,
    RevisionNotEditableError,
)


class AIAuthoringProposalServiceError(Exception):
    pass


class AIAuthoringProposalValidationError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalRevisionNotFoundError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalRevisionConflictError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalRequesterNotFoundError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalRequestMessageInvalidError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalNotFoundError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalNotPendingError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalObsoleteError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalDecisionMakerNotFoundError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalRevisionNotEditableError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalActionApplicationError(AIAuthoringProposalServiceError):
    pass


class AIAuthoringProposalConcurrentModificationError(AIAuthoringProposalServiceError):
    pass


def _require_aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise AIAuthoringProposalValidationError(
            "Source revision timestamp must include a timezone."
        )


def _require_nonblank(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise AIAuthoringProposalValidationError(f"{field_name} is invalid.")
    return value


class AIAuthoringProposalService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_pending_proposal(
        self,
        *,
        source_revision_id: uuid.UUID,
        expected_revision_updated_at: datetime,
        action_envelope: AuthoringActionEnvelope | object,
        provider_name: str,
        model_name: str,
        prompt_version: str,
        provider_schema_version: int,
        requested_by_user_id: uuid.UUID,
        request_message_id: uuid.UUID | None = None,
    ) -> AIAuthoringProposal:
        _require_aware(expected_revision_updated_at)
        provider_name = _require_nonblank(provider_name, "provider_name")
        model_name = _require_nonblank(model_name, "model_name")
        prompt_version = _require_nonblank(prompt_version, "prompt_version")
        if (
            not isinstance(provider_schema_version, int)
            or isinstance(provider_schema_version, bool)
            or provider_schema_version <= 0
        ):
            raise AIAuthoringProposalValidationError(
                "provider_schema_version is invalid."
            )
        try:
            envelope = AuthoringActionEnvelope.model_validate(action_envelope)
        except ValidationError as exc:
            raise AIAuthoringProposalValidationError(
                "Authoring action envelope is invalid."
            ) from exc

        revision = self.db.scalar(
            select(QuestionRevision).where(
                QuestionRevision.id == source_revision_id,
                QuestionRevision.deleted_at.is_(None),
            )
        )
        if revision is None:
            raise AIAuthoringProposalRevisionNotFoundError(
                "Active source revision was not found."
            )
        if revision.updated_at != expected_revision_updated_at:
            raise AIAuthoringProposalRevisionConflictError(
                "Source revision changed before proposal creation."
            )
        requester_exists = self.db.scalar(
            select(User.id).where(
                User.id == requested_by_user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if requester_exists is None:
            raise AIAuthoringProposalRequesterNotFoundError(
                "Active requester was not found."
            )
        if request_message_id is not None:
            request_message_exists = self.db.scalar(
                select(AIAuthoringMessage.id)
                .join(
                    AIAuthoringConversation,
                    AIAuthoringConversation.id == AIAuthoringMessage.conversation_id,
                )
                .where(
                    AIAuthoringMessage.id == request_message_id,
                    AIAuthoringMessage.created_by_user_id == requested_by_user_id,
                    AIAuthoringMessage.role == AIAuthoringMessageRole.USER,
                    AIAuthoringMessage.deleted_at.is_(None),
                    AIAuthoringConversation.active_revision_id == source_revision_id,
                    AIAuthoringConversation.deleted_at.is_(None),
                )
            )
            if request_message_exists is None:
                raise AIAuthoringProposalRequestMessageInvalidError(
                    "Active request message was not found for the source revision."
                )
        proposal = AIAuthoringProposal(
            source_revision_id=revision.id,
            source_revision_updated_at=revision.updated_at,
            status=AIAuthoringProposalStatus.PENDING,
            action_schema_version=envelope.schema_version,
            actions=envelope.model_dump(mode="json"),
            provider_name=provider_name,
            model_name=model_name,
            prompt_version=prompt_version,
            provider_schema_version=provider_schema_version,
            requested_by_user_id=requested_by_user_id,
            request_message_id=request_message_id,
            accepted_by_user_id=None,
            rejected_by_user_id=None,
            accepted_at=None,
            rejected_at=None,
        )
        try:
            self.db.add(proposal)
            self.db.commit()
            self.db.refresh(proposal)
            return proposal
        except Exception:
            self.db.rollback()
            raise

    def get_proposal(self, *, proposal_id: uuid.UUID) -> AIAuthoringProposal:
        proposal = self.db.scalar(
            select(AIAuthoringProposal).where(
                AIAuthoringProposal.id == proposal_id,
                AIAuthoringProposal.deleted_at.is_(None),
            )
        )
        if proposal is None:
            raise AIAuthoringProposalNotFoundError(
                "AI authoring proposal was not found."
            )
        return proposal

    def accept_proposal(
        self,
        *,
        proposal_id: uuid.UUID,
        accepted_by_user_id: uuid.UUID,
    ) -> AIAuthoringProposal:
        """Atomically apply a pending proposal and mark it accepted."""

        try:
            proposal = self._get_pending_proposal_for_update(proposal_id)
            self._require_active_decision_maker(accepted_by_user_id)
            revision = self.db.scalar(
                select(QuestionRevision)
                .where(
                    QuestionRevision.id == proposal.source_revision_id,
                    QuestionRevision.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if revision is None:
                raise AIAuthoringProposalRevisionNotFoundError(
                    "Active source revision was not found."
                )
            if revision.updated_at != proposal.source_revision_updated_at:
                proposal.status = AIAuthoringProposalStatus.OBSOLETE
                self.db.commit()
                raise AIAuthoringProposalObsoleteError(
                    "AI authoring proposal is obsolete."
                )
            try:
                envelope = AuthoringActionEnvelope.model_validate(proposal.actions)
            except ValidationError as exc:
                raise AIAuthoringProposalValidationError(
                    "Stored authoring action envelope is invalid."
                ) from exc

            try:
                QuestionEditorService(self.db).apply_action_set(
                    revision_id=revision.id,
                    expected_revision_updated_at=proposal.source_revision_updated_at,
                    actions=envelope.actions,
                )
            except RevisionNotEditableError as exc:
                raise AIAuthoringProposalRevisionNotEditableError(
                    "Source revision is not editable."
                ) from exc
            except RevisionConflictError as exc:
                raise AIAuthoringProposalConcurrentModificationError(
                    "Source revision changed during proposal acceptance."
                ) from exc
            except QuestionEditorServiceError as exc:
                raise AIAuthoringProposalActionApplicationError(
                    "AI authoring proposal actions could not be applied."
                ) from exc
            except SQLAlchemyError as exc:
                raise AIAuthoringProposalActionApplicationError(
                    "AI authoring proposal actions could not be persisted."
                ) from exc

            proposal.status = AIAuthoringProposalStatus.ACCEPTED
            proposal.accepted_by_user_id = accepted_by_user_id
            proposal.accepted_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(proposal)
            return proposal
        except AIAuthoringProposalObsoleteError:
            raise
        except Exception:
            self.db.rollback()
            raise

    def reject_proposal(
        self,
        *,
        proposal_id: uuid.UUID,
        rejected_by_user_id: uuid.UUID,
    ) -> AIAuthoringProposal:
        """Reject a pending proposal without mutating its source revision."""

        try:
            proposal = self._get_pending_proposal_for_update(proposal_id)
            self._require_active_decision_maker(rejected_by_user_id)
            proposal.status = AIAuthoringProposalStatus.REJECTED
            proposal.rejected_by_user_id = rejected_by_user_id
            proposal.rejected_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(proposal)
            return proposal
        except Exception:
            self.db.rollback()
            raise

    def _get_pending_proposal_for_update(
        self, proposal_id: uuid.UUID
    ) -> AIAuthoringProposal:
        proposal = self.db.scalar(
            select(AIAuthoringProposal)
            .where(
                AIAuthoringProposal.id == proposal_id,
                AIAuthoringProposal.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if proposal is None:
            raise AIAuthoringProposalNotFoundError(
                "AI authoring proposal was not found."
            )
        if proposal.status != AIAuthoringProposalStatus.PENDING:
            raise AIAuthoringProposalNotPendingError(
                "AI authoring proposal is not pending."
            )
        return proposal

    def _require_active_decision_maker(self, user_id: uuid.UUID) -> None:
        user_exists = self.db.scalar(
            select(User.id).where(
                User.id == user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if user_exists is None:
            raise AIAuthoringProposalDecisionMakerNotFoundError(
                "Active decision maker was not found."
            )
