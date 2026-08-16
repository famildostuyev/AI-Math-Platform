from __future__ import annotations

import hashlib
import re
import uuid
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.media_asset import MediaAsset
from app.schemas.media_asset import MediaAssetRead
from app.storage.media_storage import (
    LocalMediaStorage,
    MediaStorageError,
)


_FORMAT_POLICY = {
    "PNG": ("image/png", ".png"),
    "JPEG": ("image/jpeg", ".jpg"),
    "WEBP": ("image/webp", ".webp"),
}
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class MediaAssetServiceError(Exception):
    """Base exception for media ingestion failures."""


class EmptyImageError(MediaAssetServiceError):
    """Raised when an upload contains no bytes."""


class ImageTooLargeError(MediaAssetServiceError):
    """Raised when encoded image bytes exceed the configured limit."""


class InvalidImageError(MediaAssetServiceError):
    """Raised when bytes are corrupt or use an unsupported image format."""


class ImageDimensionsError(MediaAssetServiceError):
    """Raised when decoded dimensions exceed the configured pixel limit."""


class MediaAssetStorageError(MediaAssetServiceError):
    """Raised when local media storage cannot complete an operation."""


class MediaAssetService:
    """Validate image bytes, store them locally, and persist safe metadata."""

    def __init__(
        self,
        db: Session,
        *,
        storage: LocalMediaStorage | None = None,
        max_image_bytes: int | None = None,
        max_image_pixels: int | None = None,
    ) -> None:
        self.db = db
        self.storage = storage or LocalMediaStorage(settings.MEDIA_ROOT)
        self.max_image_bytes = (
            max_image_bytes
            if max_image_bytes is not None
            else settings.MEDIA_MAX_IMAGE_BYTES
        )
        self.max_image_pixels = (
            max_image_pixels
            if max_image_pixels is not None
            else settings.MEDIA_MAX_IMAGE_PIXELS
        )

    def create_image_asset(
        self,
        *,
        upload: BinaryIO,
        original_filename: str | None,
        submitted_mime_type: str | None = None,
    ) -> MediaAssetRead:
        """Ingest one validated PNG, JPEG, or WebP from a file-like object."""

        del submitted_mime_type  # Client MIME is deliberately non-authoritative.
        temporary_path: Path | None = None
        final_key: str | None = None
        promoted = False
        try:
            asset_key_id = uuid.uuid4()
            temporary_path = self.storage.create_temporary()
            size_bytes, sha256 = self._stream_upload(upload, temporary_path)
            image_format, width, height = self._validate_image(temporary_path)
            mime_type, extension = _FORMAT_POLICY[image_format]
            now = datetime.now(timezone.utc)
            final_key = (
                f"images/{now:%Y}/{now:%m}/{asset_key_id}{extension}"
            )
            self.storage.promote(temporary_path, final_key)
            promoted = True
            temporary_path = None

            asset = MediaAsset(
                storage_key=final_key,
                original_filename=self._normalize_filename(original_filename),
                mime_type=mime_type,
                size_bytes=size_bytes,
                sha256=sha256,
                width_px=width,
                height_px=height,
            )
            self.db.add(asset)
            self.db.commit()
            self.db.refresh(asset)
            return MediaAssetRead.model_validate(asset)
        except MediaStorageError as exc:
            self.db.rollback()
            self._cleanup(temporary_path, final_key if promoted else None)
            raise MediaAssetStorageError(
                "Image storage could not be completed."
            ) from exc
        except Exception:
            self.db.rollback()
            self._cleanup(temporary_path, final_key if promoted else None)
            raise

    def _stream_upload(
        self,
        upload: BinaryIO,
        temporary_path: Path,
    ) -> tuple[int, str]:
        size_bytes = 0
        digest = hashlib.sha256()
        with self.storage.open_temporary(temporary_path) as destination:
            while True:
                chunk = upload.read(64 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > self.max_image_bytes:
                    raise ImageTooLargeError(
                        "Image exceeds the encoded size limit."
                    )
                digest.update(chunk)
                destination.write(chunk)
        if size_bytes == 0:
            raise EmptyImageError("Image upload is empty.")
        return size_bytes, digest.hexdigest()

    def _validate_image(self, path: Path) -> tuple[str, int, int]:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(path) as image:
                    image_format = image.format
                    width, height = image.size
                    if image_format not in _FORMAT_POLICY:
                        raise InvalidImageError(
                            "Image format is unsupported."
                        )
                    if (
                        width <= 0
                        or height <= 0
                        or width * height > self.max_image_pixels
                    ):
                        raise ImageDimensionsError(
                            "Image dimensions exceed the pixel limit."
                        )
                    image.verify()
                with Image.open(path) as image:
                    image.load()
            return image_format, width, height
        except (InvalidImageError, ImageDimensionsError):
            raise
        except (
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            ValueError,
        ) as exc:
            raise InvalidImageError("Image content is invalid.") from exc

    def _cleanup(
        self,
        temporary_path: Path | None,
        final_key: str | None,
    ) -> None:
        if temporary_path is not None:
            self.storage.remove_temporary(temporary_path)
        if final_key is not None:
            self.storage.remove_key(final_key)

    @staticmethod
    def _normalize_filename(original_filename: str | None) -> str | None:
        if original_filename is None:
            return None
        name = re.split(r"[/\\]", original_filename)[-1]
        name = _CONTROL_CHARACTERS.sub("", name).strip()
        return name[:255] or None
