from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AIAuthoringConversationStatus
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.ai_authoring_message import AIAuthoringMessage
    from app.models.question_revision import QuestionRevision
    from app.models.user import User


class AIAuthoringConversation(BaseModel):
    __tablename__ = "ai_authoring_conversations"

    active_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[AIAuthoringConversationStatus] = mapped_column(
        SQLEnum(
            AIAuthoringConversationStatus,
            name="ai_authoring_conversation_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )

    active_revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision", foreign_keys=[active_revision_id]
    )
    created_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by_user_id]
    )
    messages: Mapped[list["AIAuthoringMessage"]] = relationship(
        "AIAuthoringMessage",
        back_populates="conversation",
        order_by="AIAuthoringMessage.sequence_number",
        passive_deletes=True,
    )
