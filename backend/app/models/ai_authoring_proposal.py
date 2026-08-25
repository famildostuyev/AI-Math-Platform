from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum as SQLEnum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AIAuthoringProposalStatus
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.ai_authoring_message import AIAuthoringMessage
    from app.models.question_revision import QuestionRevision
    from app.models.user import User


class AIAuthoringProposal(BaseModel):
    """Validated AI authoring actions awaiting an explicit future decision."""

    __tablename__ = "ai_authoring_proposals"

    __table_args__ = (
        CheckConstraint(
            "action_schema_version > 0",
            name="ck_ai_authoring_proposals_action_schema_version_positive",
        ),
        CheckConstraint(
            "provider_schema_version > 0",
            name="ck_ai_authoring_proposals_provider_schema_version_positive",
        ),
        CheckConstraint(
            "char_length(btrim(provider_name)) > 0 "
            "AND char_length(btrim(model_name)) > 0 "
            "AND char_length(btrim(prompt_version)) > 0",
            name="ck_ai_authoring_proposals_provenance_nonblank",
        ),
        CheckConstraint(
            "(status = 'pending' AND accepted_by_user_id IS NULL "
            "AND rejected_by_user_id IS NULL AND accepted_at IS NULL "
            "AND rejected_at IS NULL) OR "
            "(status = 'accepted' AND accepted_by_user_id IS NOT NULL "
            "AND accepted_at IS NOT NULL AND rejected_by_user_id IS NULL "
            "AND rejected_at IS NULL) OR "
            "(status = 'rejected' AND rejected_by_user_id IS NOT NULL "
            "AND rejected_at IS NOT NULL AND accepted_by_user_id IS NULL "
            "AND accepted_at IS NULL) OR "
            "(status = 'obsolete' AND accepted_by_user_id IS NULL "
            "AND rejected_by_user_id IS NULL AND accepted_at IS NULL "
            "AND rejected_at IS NULL)",
            name="ck_ai_authoring_proposals_lifecycle_consistent",
        ),
    )

    source_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    source_revision_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    status: Mapped[AIAuthoringProposalStatus] = mapped_column(
        SQLEnum(
            AIAuthoringProposalStatus,
            name="ai_authoring_proposal_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    action_schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    actions: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    provider_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_name: Mapped[str] = mapped_column(String(200), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    request_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_authoring_messages.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    accepted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    rejected_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    source_revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision", foreign_keys=[source_revision_id],
    )
    requested_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[requested_by_user_id],
    )
    request_message: Mapped["AIAuthoringMessage | None"] = relationship(
        "AIAuthoringMessage", foreign_keys=[request_message_id]
    )
    accepted_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[accepted_by_user_id],
    )
    rejected_by_user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[rejected_by_user_id],
    )
