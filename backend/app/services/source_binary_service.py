from __future__ import annotations

import hashlib
import re
import uuid
import warnings
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO

from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError

from app.core.config import settings
from app.storage.media_storage import LocalMediaStorage, MediaStorageError


_IMAGE_FORMATS = {
    "PNG": ("image/png", ".png"),
    "JPEG": ("image/jpeg", ".jpg"),
    "WEBP": ("image/webp", ".webp"),
}
_PDF_MIME = "application/pdf"
_DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document"
)
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
_DOCX_REQUIRED_MEMBERS = {
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
}
_DOCX_MAIN_CONTENT_TYPE = (
    b"application/vnd.openxmlformats-officedocument."
    b"wordprocessingml.document.main+xml"
)


class SourceBinaryServiceError(Exception):
    """Base exception for immutable source-binary preparation failures."""


class EmptySourceBinaryError(SourceBinaryServiceError):
    """Raised when an uploaded source contains no bytes."""


class SourceBinaryTooLargeError(SourceBinaryServiceError):
    """Raised when encoded source bytes exceed the configured limit."""


class UnsupportedSourceBinaryError(SourceBinaryServiceError):
    """Raised when source content is not one of the supported formats."""


class InvalidSourceBinaryError(SourceBinaryServiceError):
    """Raised when recognized source content is corrupt or malformed."""


class UnsafeSourceBinaryError(SourceBinaryServiceError):
    """Raised when encrypted or unsafe container content is detected."""


class SourceBinaryImageDimensionsError(SourceBinaryServiceError):
    """Raised when decoded image dimensions exceed the configured limit."""


class SourceBinaryStorageError(SourceBinaryServiceError):
    """Raised when prepared source storage cannot complete an operation."""


class SourceBinaryCleanupError(SourceBinaryServiceError):
    """Raised when cleanup of a service-created prepared binary fails."""


@dataclass(frozen=True, slots=True)
class PreparedSourceBinary:
    original_filename: str | None
    mime_type: str
    size_bytes: int
    sha256: str
    storage_key: str
    width_px: int | None
    height_px: int | None


class SourceBinaryService:
    """Validate and promote source binaries without database behavior."""

    def __init__(
        self,
        *,
        storage: LocalMediaStorage | None = None,
        max_source_bytes: int | None = None,
        max_image_pixels: int | None = None,
        max_docx_members: int | None = None,
        max_docx_expanded_bytes: int | None = None,
    ) -> None:
        self.storage = storage or LocalMediaStorage(settings.MEDIA_ROOT)
        self.max_source_bytes = max_source_bytes or settings.MEDIA_MAX_SOURCE_BYTES
        self.max_image_pixels = max_image_pixels or settings.MEDIA_MAX_IMAGE_PIXELS
        self.max_docx_members = max_docx_members or settings.MEDIA_MAX_DOCX_MEMBERS
        self.max_docx_expanded_bytes = (
            max_docx_expanded_bytes or settings.MEDIA_MAX_DOCX_EXPANDED_BYTES
        )
        self._prepared_keys: set[str] = set()

    def prepare_source_binary(
        self,
        *,
        upload: BinaryIO,
        original_filename: str | None,
        submitted_mime_type: str | None,
    ) -> PreparedSourceBinary:
        """Validate, hash, and promote one immutable supported source."""

        del submitted_mime_type
        temporary_path: Path | None = None
        final_key: str | None = None
        promoted = False
        try:
            temporary_path = self.storage.create_temporary()
            size_bytes, sha256 = self._stream_upload(upload, temporary_path)
            mime_type, extension, width, height = self._validate(temporary_path)
            now = datetime.now(timezone.utc)
            final_key = f"sources/{now:%Y}/{now:%m}/{uuid.uuid4()}{extension}"
            self.storage.promote(temporary_path, final_key)
            promoted = True
            temporary_path = None
            prepared = PreparedSourceBinary(
                original_filename=self._normalize_filename(original_filename),
                mime_type=mime_type,
                size_bytes=size_bytes,
                sha256=sha256,
                storage_key=final_key,
                width_px=width,
                height_px=height,
            )
            self._prepared_keys.add(final_key)
            return prepared
        except MediaStorageError as exc:
            self._cleanup_failed_preparation(
                temporary_path, final_key if promoted else None,
            )
            raise SourceBinaryStorageError(
                "Source binary storage could not be completed."
            ) from exc
        except Exception:
            self._cleanup_failed_preparation(
                temporary_path, final_key if promoted else None,
            )
            raise

    def cleanup_prepared(self, prepared: PreparedSourceBinary) -> None:
        """Remove one promoted binary issued by this service instance."""

        if prepared.storage_key not in self._prepared_keys:
            raise SourceBinaryCleanupError(
                "Prepared source binary is not owned by this service."
            )
        try:
            self.storage.remove_key(prepared.storage_key)
        except MediaStorageError as exc:
            raise SourceBinaryCleanupError(
                "Prepared source binary could not be cleaned up."
            ) from exc
        self._prepared_keys.remove(prepared.storage_key)

    def _stream_upload(
        self, upload: BinaryIO, temporary_path: Path,
    ) -> tuple[int, str]:
        size_bytes = 0
        digest = hashlib.sha256()
        with self.storage.open_temporary(temporary_path) as destination:
            while True:
                chunk = upload.read(64 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > self.max_source_bytes:
                    raise SourceBinaryTooLargeError(
                        "Source binary exceeds the encoded size limit."
                    )
                digest.update(chunk)
                destination.write(chunk)
        if size_bytes == 0:
            raise EmptySourceBinaryError("Source binary upload is empty.")
        return size_bytes, digest.hexdigest()

    def _validate(
        self, path: Path,
    ) -> tuple[str, str, int | None, int | None]:
        with path.open("rb") as source:
            header = source.read(16)
        if header.startswith(b"%PDF-"):
            self._validate_pdf(path)
            return _PDF_MIME, ".pdf", None, None
        if header.startswith(b"PK\x03\x04"):
            self._validate_docx(path)
            return _DOCX_MIME, ".docx", None, None
        if header.lstrip().startswith(b"<svg"):
            raise UnsupportedSourceBinaryError(
                "Source image format is unsupported."
            )
        if self._looks_like_image(header):
            image_format, width, height = self._validate_image(path)
            mime_type, extension = _IMAGE_FORMATS[image_format]
            return mime_type, extension, width, height
        raise UnsupportedSourceBinaryError("Source binary format is unsupported.")

    @staticmethod
    def _looks_like_image(header: bytes) -> bool:
        return (
            header.startswith(b"\x89PNG\r\n\x1a\n")
            or header.startswith(b"\xff\xd8\xff")
            or (header.startswith(b"RIFF") and header[8:12] == b"WEBP")
            or header.startswith((b"GIF87a", b"GIF89a", b"BM"))
        )

    def _validate_image(self, path: Path) -> tuple[str, int, int]:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(path) as image:
                    image_format = image.format
                    width, height = image.size
                    if image_format not in _IMAGE_FORMATS:
                        raise UnsupportedSourceBinaryError(
                            "Source image format is unsupported."
                        )
                    if width <= 0 or height <= 0 or width * height > self.max_image_pixels:
                        raise SourceBinaryImageDimensionsError(
                            "Source image dimensions exceed the pixel limit."
                        )
                    image.verify()
                with Image.open(path) as image:
                    image.load()
            return image_format, width, height
        except (UnsupportedSourceBinaryError, SourceBinaryImageDimensionsError):
            raise
        except (
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            ValueError,
        ) as exc:
            raise InvalidSourceBinaryError("Source image content is invalid.") from exc

    @staticmethod
    def _validate_pdf(path: Path) -> None:
        try:
            reader = PdfReader(str(path), strict=True)
            if reader.is_encrypted:
                raise UnsafeSourceBinaryError("Encrypted PDF sources are unsupported.")
            len(reader.pages)
        except UnsafeSourceBinaryError:
            raise
        except FileNotDecryptedError as exc:
            raise UnsafeSourceBinaryError(
                "Encrypted PDF sources are unsupported."
            ) from exc
        except (PdfReadError, OSError, ValueError, TypeError) as exc:
            raise InvalidSourceBinaryError("PDF source content is invalid.") from exc

    def _validate_docx(self, path: Path) -> None:
        try:
            with zipfile.ZipFile(path) as archive:
                members = archive.infolist()
                if len(members) > self.max_docx_members:
                    raise UnsafeSourceBinaryError(
                        "DOCX archive contains too many members."
                    )
                expanded_size = 0
                names: set[str] = set()
                for member in members:
                    self._validate_archive_member(member)
                    expanded_size += member.file_size
                    if expanded_size > self.max_docx_expanded_bytes:
                        raise UnsafeSourceBinaryError(
                            "DOCX archive expands beyond the safe limit."
                        )
                    names.add(member.filename)
                if not _DOCX_REQUIRED_MEMBERS.issubset(names):
                    raise InvalidSourceBinaryError(
                        "DOCX package structure is incomplete."
                    )
                content_types = archive.read("[Content_Types].xml")
                if _DOCX_MAIN_CONTENT_TYPE not in content_types:
                    raise InvalidSourceBinaryError(
                        "DOCX main document content type is unavailable."
                    )
                archive.read("_rels/.rels")
                archive.read("word/document.xml")
        except (InvalidSourceBinaryError, UnsafeSourceBinaryError):
            raise
        except (zipfile.BadZipFile, KeyError, OSError, RuntimeError) as exc:
            raise InvalidSourceBinaryError("DOCX source content is invalid.") from exc

    @staticmethod
    def _validate_archive_member(member: zipfile.ZipInfo) -> None:
        name = member.filename
        path = PurePosixPath(name)
        if (
            not name
            or "\\" in name
            or path.is_absolute()
            or any(part in {"", ".", ".."} for part in path.parts)
            or ":" in path.parts[0]
            or member.flag_bits & 0x1
        ):
            raise UnsafeSourceBinaryError(
                "DOCX archive contains an unsafe member."
            )

    def _cleanup_failed_preparation(
        self, temporary_path: Path | None, final_key: str | None,
    ) -> None:
        try:
            if temporary_path is not None:
                self.storage.remove_temporary(temporary_path)
            if final_key is not None:
                self.storage.remove_key(final_key)
        except MediaStorageError as exc:
            raise SourceBinaryCleanupError(
                "Failed source preparation could not be cleaned up."
            ) from exc

    @staticmethod
    def _normalize_filename(original_filename: str | None) -> str | None:
        if original_filename is None:
            return None
        name = re.split(r"[/\\]", original_filename)[-1]
        name = _CONTROL_CHARACTERS.sub("", name).strip()
        return name[:255] or None
