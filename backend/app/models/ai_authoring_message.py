from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum as SQLEnum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AIAuthoringMessageRole
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.ai_authoring_conversation import AIAuthoringConversation
    from app.models.user import User


AI_AUTHORING_MESSAGE_MAX_LENGTH = 10_000


class AIAuthoringMessage(BaseModel):
    __tablename__ = "ai_authoring_messages"
    __table_args__ = (
        CheckConstraint(
            "sequence_number > 0",
            name="ck_ai_authoring_messages_sequence_positive",
        ),
        CheckConstraint(
            "char_length(btrim(content)) > 0",
            name="ck_ai_authoring_messages_content_nonblank",
        ),
        UniqueConstraint(
            "conversation_id",
            "sequence_number",
            name="uq_ai_authoring_messages_conversation_sequence",
        ),
    )

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_authoring_conversations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    role: Mapped[AIAuthoringMessageRole] = mapped_column(
        SQLEnum(
            AIAuthoringMessageRole,
            name="ai_authoring_message_role",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(
        String(AI_AUTHORING_MESSAGE_MAX_LENGTH), nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    conversation: Mapped["AIAuthoringConversation"] = relationship(
        "AIAuthoringConversation", back_populates="messages"
    )
    created_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
