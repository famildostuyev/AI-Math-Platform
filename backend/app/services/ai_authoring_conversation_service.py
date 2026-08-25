from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import AIAuthoringConversationStatus, AIAuthoringMessageRole
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.models.ai_authoring_message import (
    AI_AUTHORING_MESSAGE_MAX_LENGTH,
    AIAuthoringMessage,
)
from app.models.question_revision import QuestionRevision
from app.models.user import User


class AIAuthoringConversationServiceError(Exception):
    pass


class AIAuthoringConversationNotFoundError(AIAuthoringConversationServiceError):
    pass


class AIAuthoringConversationClosedError(AIAuthoringConversationServiceError):
    pass


class AIAuthoringConversationRevisionNotFoundError(
    AIAuthoringConversationServiceError
):
    pass


class AIAuthoringConversationUserNotFoundError(AIAuthoringConversationServiceError):
    pass


class AIAuthoringMessageValidationError(AIAuthoringConversationServiceError):
    pass


class AIAuthoringMessageSequenceConflictError(AIAuthoringConversationServiceError):
    pass


class AIAuthoringConversationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_conversation(
        self,
        *,
        active_revision_id: uuid.UUID,
        created_by_user_id: uuid.UUID,
    ) -> AIAuthoringConversation:
        revision = self.db.scalar(
            select(QuestionRevision).where(
                QuestionRevision.id == active_revision_id,
                QuestionRevision.deleted_at.is_(None),
            )
        )
        if revision is None:
            raise AIAuthoringConversationRevisionNotFoundError(
                "Active question revision was not found."
            )
        self._require_active_user(created_by_user_id)
        conversation = AIAuthoringConversation(
            active_revision_id=revision.id,
            created_by_user_id=created_by_user_id,
            status=AIAuthoringConversationStatus.ACTIVE,
        )
        try:
            self.db.add(conversation)
            self.db.commit()
            self.db.refresh(conversation)
            return conversation
        except Exception:
            self.db.rollback()
            raise

    def get_conversation(
        self, *, conversation_id: uuid.UUID
    ) -> AIAuthoringConversation:
        conversation = self.db.scalar(
            select(AIAuthoringConversation).where(
                AIAuthoringConversation.id == conversation_id,
                AIAuthoringConversation.deleted_at.is_(None),
            )
        )
        if conversation is None:
            raise AIAuthoringConversationNotFoundError(
                "AI authoring conversation was not found."
            )
        return conversation

    def add_user_message(
        self,
        *,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
    ) -> AIAuthoringMessage:
        content = self._validate_content(content)
        self._require_active_user(user_id)
        return self._add_message(
            conversation_id=conversation_id,
            role=AIAuthoringMessageRole.USER,
            content=content,
            created_by_user_id=user_id,
        )

    def add_assistant_message(
        self,
        *,
        conversation_id: uuid.UUID,
        content: str,
    ) -> AIAuthoringMessage:
        """Internal persistence path for a future provider response."""

        return self._add_message(
            conversation_id=conversation_id,
            role=AIAuthoringMessageRole.ASSISTANT,
            content=content,
            created_by_user_id=None,
        )

    def list_messages(
        self, *, conversation_id: uuid.UUID
    ) -> list[AIAuthoringMessage]:
        self.get_conversation(conversation_id=conversation_id)
        return list(
            self.db.scalars(
                select(AIAuthoringMessage)
                .where(
                    AIAuthoringMessage.conversation_id == conversation_id,
                    AIAuthoringMessage.deleted_at.is_(None),
                )
                .order_by(AIAuthoringMessage.sequence_number, AIAuthoringMessage.id)
            ).all()
        )

    def close_conversation(
        self,
        *,
        conversation_id: uuid.UUID,
        closed_by_user_id: uuid.UUID,
    ) -> AIAuthoringConversation:
        self._require_active_user(closed_by_user_id)
        try:
            conversation = self._get_conversation_for_update(conversation_id)
            if conversation.status != AIAuthoringConversationStatus.ACTIVE:
                raise AIAuthoringConversationClosedError(
                    "AI authoring conversation is already closed."
                )
            conversation.status = AIAuthoringConversationStatus.CLOSED
            self.db.commit()
            self.db.refresh(conversation)
            return conversation
        except Exception:
            self.db.rollback()
            raise

    def _add_message(
        self,
        *,
        conversation_id: uuid.UUID,
        role: AIAuthoringMessageRole,
        content: str,
        created_by_user_id: uuid.UUID | None,
    ) -> AIAuthoringMessage:
        content = self._validate_content(content)
        try:
            conversation = self._get_conversation_for_update(conversation_id)
            if conversation.status != AIAuthoringConversationStatus.ACTIVE:
                raise AIAuthoringConversationClosedError(
                    "Closed conversations cannot receive new messages."
                )
            maximum_sequence = self.db.scalar(
                select(func.max(AIAuthoringMessage.sequence_number)).where(
                    AIAuthoringMessage.conversation_id == conversation.id
                )
            )
            message = AIAuthoringMessage(
                conversation_id=conversation.id,
                role=role,
                sequence_number=(maximum_sequence or 0) + 1,
                content=content,
                created_by_user_id=created_by_user_id,
            )
            self.db.add(message)
            self.db.commit()
            self.db.refresh(message)
            return message
        except IntegrityError as exc:
            self.db.rollback()
            raise AIAuthoringMessageSequenceConflictError(
                "Message sequence could not be allocated."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def _get_conversation_for_update(
        self, conversation_id: uuid.UUID
    ) -> AIAuthoringConversation:
        conversation = self.db.scalar(
            select(AIAuthoringConversation)
            .where(
                AIAuthoringConversation.id == conversation_id,
                AIAuthoringConversation.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if conversation is None:
            raise AIAuthoringConversationNotFoundError(
                "AI authoring conversation was not found."
            )
        return conversation

    def _require_active_user(self, user_id: uuid.UUID) -> None:
        user_exists = self.db.scalar(
            select(User.id).where(
                User.id == user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if user_exists is None:
            raise AIAuthoringConversationUserNotFoundError(
                "Active conversation user was not found."
            )

    @staticmethod
    def _validate_content(content: str) -> str:
        if not isinstance(content, str) or not content.strip():
            raise AIAuthoringMessageValidationError(
                "Message content must not be blank."
            )
        if len(content) > AI_AUTHORING_MESSAGE_MAX_LENGTH:
            raise AIAuthoringMessageValidationError(
                "Message content exceeds the maximum length."
            )
        return content
