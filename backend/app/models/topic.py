from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.section import Section


class Topic(BaseModel):
    __tablename__ = "topics"

    __table_args__ = (
        UniqueConstraint(
            "section_id",
            "name",
            name="uq_topics_section_id_name",
        ),
    )

    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
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

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    section: Mapped["Section"] = relationship(
        "Section",
        back_populates="topics",
    )

    parent: Mapped["Topic | None"] = relationship(
        "Topic",
        remote_side="Topic.id",
        foreign_keys=[parent_id],
        back_populates="children",
    )

    children: Mapped[list["Topic"]] = relationship(
        "Topic",
        foreign_keys="Topic.parent_id",
        back_populates="parent",
    )
