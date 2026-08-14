from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base_model import BaseModel


class MediaAsset(BaseModel):
    """Metadata for one immutable binary object in external storage."""

    __tablename__ = "media_assets"

    __table_args__ = (
        CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_media_assets_storage_key_not_blank",
        ),
        CheckConstraint(
            "char_length(btrim(mime_type)) > 0",
            name="ck_media_assets_mime_type_not_blank",
        ),
        CheckConstraint(
            "size_bytes > 0",
            name="ck_media_assets_size_bytes_positive",
        ),
        CheckConstraint(
            "char_length(sha256) = 64",
            name="ck_media_assets_sha256_length",
        ),
        CheckConstraint(
            "width_px IS NULL OR width_px > 0",
            name="ck_media_assets_width_px_positive",
        ),
        CheckConstraint(
            "height_px IS NULL OR height_px > 0",
            name="ck_media_assets_height_px_positive",
        ),
    )

    storage_key: Mapped[str] = mapped_column(
        String(1024),
        unique=True,
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    original_filename: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    width_px: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    height_px: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
