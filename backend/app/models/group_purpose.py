from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.purpose import Purpose


class GroupPurpose(BaseModel):
    __tablename__ = "group_purposes"

    __table_args__ = (
        UniqueConstraint(
            "group_id",
            "purpose_id",
            name="uq_group_purposes_group_id_purpose_id",
        ),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    purpose_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group: Mapped["Group"] = relationship(
        "Group",
        back_populates="purposes",
    )

    purpose: Mapped["Purpose"] = relationship(
        "Purpose",
        back_populates="group_purposes",
    )