from __future__ import annotations

from typing import TYPE_CHECKING

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.group_purpose import GroupPurpose


class Purpose(BaseModel):
    __tablename__ = "purposes"

    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )

    is_system: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    parent: Mapped["Purpose | None"] = relationship(
        "Purpose",
        remote_side="Purpose.id",
        foreign_keys=[parent_id],
        back_populates="children",
    )

    children: Mapped[list["Purpose"]] = relationship(
        "Purpose",
        foreign_keys="Purpose.parent_id",
        back_populates="parent",
    )

    group_purposes: Mapped[list["GroupPurpose"]] = relationship(
        "GroupPurpose",
        back_populates="purpose",
        cascade="all, delete-orphan",
    )