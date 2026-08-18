from __future__ import annotations

import os
import uuid
from pathlib import Path, PurePosixPath
from typing import BinaryIO


class MediaStorageError(Exception):
    """Base exception for local media storage failures."""


class MediaStorageCollisionError(MediaStorageError):
    """Raised when a final storage key already exists."""


class MediaStoragePathError(MediaStorageError):
    """Raised when a path is outside the configured media root."""


class LocalMediaStorage:
    """Confined local-filesystem storage using portable logical keys."""

    def __init__(self, media_root: Path) -> None:
        self.media_root = media_root.resolve()

    def resolve(self, storage_key: str) -> Path:
        if not storage_key or "\\" in storage_key:
            raise MediaStoragePathError("Invalid logical storage key.")
        key = PurePosixPath(storage_key)
        if key.is_absolute() or any(part in {"", ".", ".."} for part in key.parts):
            raise MediaStoragePathError("Invalid logical storage key.")
        if ":" in key.parts[0]:
            raise MediaStoragePathError("Invalid logical storage key.")
        resolved = (self.media_root / Path(*key.parts)).resolve()
        return self._require_contained(resolved)

    def create_temporary(self) -> Path:
        temporary_root = self._require_contained(
            (self.media_root / ".tmp").resolve()
        )
        temporary_root.mkdir(parents=True, exist_ok=True)
        path = temporary_root / f"{uuid.uuid4()}.tmp"
        try:
            path.open("xb").close()
        except OSError as exc:
            raise MediaStorageError(
                "Could not create temporary media storage."
            ) from exc
        return path

    def open_temporary(self, path: Path) -> BinaryIO:
        contained = self._require_contained(path.resolve())
        return contained.open("wb")

    def promote(self, temporary_path: Path, storage_key: str) -> Path:
        source = self._require_contained(temporary_path.resolve())
        final_path = self.resolve(storage_key)
        final_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(source, final_path)
        except FileExistsError as exc:
            raise MediaStorageCollisionError(
                "The media storage key already exists."
            ) from exc
        except OSError as exc:
            raise MediaStorageError("Could not promote media storage.") from exc
        try:
            source.unlink()
        except OSError as exc:
            try:
                final_path.unlink()
            except OSError:
                pass
            raise MediaStorageError("Could not finalize media storage.") from exc
        return final_path

    def remove_key(self, storage_key: str) -> None:
        self._remove_path(self.resolve(storage_key))

    def open_key(self, storage_key: str) -> BinaryIO:
        """Open one confined final object for binary, read-only access."""

        path = self.resolve(storage_key)
        try:
            return path.open("rb")
        except OSError as exc:
            raise MediaStorageError(
                "Could not open stored media for reading."
            ) from exc

    def remove_temporary(self, path: Path) -> None:
        self._remove_path(self._require_contained(path.resolve()))

    def _remove_path(self, path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            raise MediaStorageError("Could not remove media storage.") from exc

    def _require_contained(self, path: Path) -> Path:
        if not path.is_relative_to(self.media_root):
            raise MediaStoragePathError("Path escapes the media root.")
        return path
