from __future__ import annotations

import hashlib
import io
import inspect
import sys
import tempfile
import unittest
import uuid
import zipfile
import os
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest.mock import MagicMock


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image
from pypdf import PdfWriter

from app.services.source_binary_service import (
    EmptySourceBinaryError,
    InvalidSourceBinaryError,
    PreparedSourceBinary,
    SourceBinaryCleanupError,
    SourceBinaryImageDimensionsError,
    SourceBinaryService,
    SourceBinaryStorageError,
    SourceBinaryTooLargeError,
    UnsafeSourceBinaryError,
    UnsupportedSourceBinaryError,
)
from app.storage.media_storage import LocalMediaStorage, MediaStorageError


DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document"
)
CONTENT_TYPES = (
    b'<?xml version="1.0"?>'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    b'<Override PartName="/word/document.xml" '
    b'ContentType="application/vnd.openxmlformats-officedocument.'
    b'wordprocessingml.document.main+xml"/></Types>'
)


def image_bytes(image_format: str, size: tuple[int, int] = (3, 2)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color=(20, 40, 60)).save(
        output, format=image_format,
    )
    return output.getvalue()


def pdf_bytes(*, encrypted: bool = False) -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    if encrypted:
        writer.encrypt("password")
    writer.write(output)
    return output.getvalue()


def docx_bytes(
    *,
    extra_entries: dict[str, bytes] | None = None,
    include_required: bool = True,
) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        if include_required:
            archive.writestr("[Content_Types].xml", CONTENT_TYPES)
            archive.writestr("_rels/.rels", b"<Relationships/>")
            archive.writestr("word/document.xml", b"<w:document/>")
        for name, content in (extra_entries or {}).items():
            archive.writestr(name, content)
    return output.getvalue()


class SourceBinaryServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "media"
        self.storage = LocalMediaStorage(self.root)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _service(self, **overrides: object) -> SourceBinaryService:
        arguments = {
            "storage": self.storage,
            "max_source_bytes": 10 * 1024 * 1024,
            "max_image_pixels": 40_000_000,
            "max_docx_members": 1024,
            "max_docx_expanded_bytes": 10 * 1024 * 1024,
        }
        arguments.update(overrides)
        return SourceBinaryService(**arguments)  # type: ignore[arg-type]

    def _files(self) -> list[Path]:
        return [path for path in self.root.rglob("*") if path.is_file()]

    def _prepare(
        self,
        service: SourceBinaryService,
        data: bytes,
        *,
        filename: str | None = "source.bin",
        mime: str | None = "application/octet-stream",
    ) -> PreparedSourceBinary:
        return service.prepare_source_binary(
            upload=io.BytesIO(data),
            original_filename=filename,
            submitted_mime_type=mime,
        )

    def test_empty_size_limit_hash_and_bounded_streaming(self) -> None:
        service = self._service()
        with self.assertRaises(EmptySourceBinaryError):
            self._prepare(service, b"")
        self.assertEqual(self._files(), [])

        data = image_bytes("PNG")
        prepared = self._prepare(service, data)
        self.assertEqual(prepared.size_bytes, len(data))
        self.assertEqual(prepared.sha256, hashlib.sha256(data).hexdigest())

        oversized = io.BytesIO(b"x" * (128 * 1024))
        limited = self._service(max_source_bytes=10)
        with self.assertRaises(SourceBinaryTooLargeError):
            limited.prepare_source_binary(
                upload=oversized, original_filename=None,
                submitted_mime_type=None,
            )
        self.assertEqual(oversized.tell(), 64 * 1024)

    def test_filename_is_safe_display_metadata_only(self) -> None:
        cases = (
            (None, None),
            (r"C:\private\book.pdf", "book.pdf"),
            ("../../private/book.pdf", "book.pdf"),
            ("bad\r\nname.pdf", "badname.pdf"),
            ("x" * 300, "x" * 255),
        )
        for supplied, expected in cases:
            with self.subTest(supplied=supplied):
                prepared = self._prepare(
                    self._service(), pdf_bytes(), filename=supplied,
                    mime="image/jpeg",
                )
                self.assertEqual(prepared.original_filename, expected)
                self.assertEqual(prepared.mime_type, "application/pdf")

    def test_png_jpeg_and_webp_are_verified_and_canonicalized(self) -> None:
        cases = (
            ("PNG", "image/png", ".png"),
            ("JPEG", "image/jpeg", ".jpg"),
            ("WEBP", "image/webp", ".webp"),
        )
        for image_format, mime_type, extension in cases:
            with self.subTest(image_format=image_format):
                prepared = self._prepare(
                    self._service(), image_bytes(image_format),
                    filename="misleading.pdf", mime="application/pdf",
                )
                self.assertEqual(prepared.mime_type, mime_type)
                self.assertTrue(prepared.storage_key.endswith(extension))
                self.assertEqual((prepared.width_px, prepared.height_px), (3, 2))

    def test_corrupt_and_unsupported_images_are_rejected_and_cleaned(self) -> None:
        cases = (
            (image_bytes("PNG")[:20], InvalidSourceBinaryError),
            (image_bytes("GIF"), UnsupportedSourceBinaryError),
            (image_bytes("BMP"), UnsupportedSourceBinaryError),
            (b"<svg><rect/></svg>", UnsupportedSourceBinaryError),
        )
        for data, error in cases:
            with self.subTest(error=error.__name__):
                with self.assertRaises(error):
                    self._prepare(self._service(), data)
                self.assertEqual(self._files(), [])

    def test_image_pixel_limit_is_preserved(self) -> None:
        with self.assertRaises(SourceBinaryImageDimensionsError):
            self._prepare(
                self._service(max_image_pixels=3),
                image_bytes("PNG", (2, 2)),
            )
        self.assertEqual(self._files(), [])

    def test_pdf_is_structurally_validated_without_trusting_name_or_mime(self) -> None:
        data = pdf_bytes()
        prepared = self._prepare(
            self._service(), data,
            filename="image.jpg", mime="image/jpeg",
        )
        self.assertEqual(prepared.mime_type, "application/pdf")
        self.assertTrue(prepared.storage_key.endswith(".pdf"))
        self.assertEqual((prepared.width_px, prepared.height_px), (None, None))

        for invalid in (b"random bytes", data[:30], b"%PDF-not-a-real-pdf"):
            with self.subTest(size=len(invalid)):
                expected = (
                    InvalidSourceBinaryError
                    if invalid.startswith(b"%PDF-")
                    else UnsupportedSourceBinaryError
                )
                with self.assertRaises(expected):
                    self._prepare(
                        self._service(), invalid,
                        filename="document.pdf", mime="application/pdf",
                    )

    def test_encrypted_pdf_is_rejected_as_unsafe(self) -> None:
        with self.assertRaises(UnsafeSourceBinaryError):
            self._prepare(self._service(), pdf_bytes(encrypted=True))
        self.assertEqual(self._files(), [])

    def test_valid_docx_is_verified_and_generic_or_corrupt_zip_is_rejected(self) -> None:
        prepared = self._prepare(
            self._service(), docx_bytes(),
            filename="renamed.pdf", mime="application/pdf",
        )
        self.assertEqual(prepared.mime_type, DOCX_MIME)
        self.assertTrue(prepared.storage_key.endswith(".docx"))

        with self.assertRaises(InvalidSourceBinaryError):
            self._prepare(
                self._service(),
                docx_bytes(extra_entries={"notes.txt": b"notes"}, include_required=False),
            )
        with self.assertRaises(InvalidSourceBinaryError):
            self._prepare(self._service(), b"PK\x03\x04corrupt")

    def test_docx_unsafe_paths_member_count_and_expansion_are_bounded(self) -> None:
        with self.assertRaises(UnsafeSourceBinaryError):
            self._prepare(
                self._service(), docx_bytes(extra_entries={"../evil": b"x"}),
            )
        with self.assertRaises(UnsafeSourceBinaryError):
            self._prepare(
                self._service(max_docx_members=3),
                docx_bytes(extra_entries={"word/extra.xml": b"x"}),
            )
        with self.assertRaises(UnsafeSourceBinaryError):
            self._prepare(
                self._service(max_docx_expanded_bytes=10), docx_bytes(),
            )
        self.assertEqual(self._files(), [])

    def test_storage_key_is_generated_confined_and_duplicates_remain_distinct(self) -> None:
        data = image_bytes("PNG")
        first = self._prepare(
            self._service(), data, filename="../../chosen/path.exe",
        )
        second = self._prepare(self._service(), data)
        self.assertRegex(
            first.storage_key,
            r"^sources/\d{4}/\d{2}/[0-9a-f-]{36}\.png$",
        )
        self.assertTrue(self.storage.resolve(first.storage_key).is_relative_to(
            self.root.resolve(),
        ))
        self.assertNotEqual(first.storage_key, second.storage_key)
        self.assertEqual(first.sha256, second.sha256)

    def test_cleanup_removes_only_binary_owned_by_same_service(self) -> None:
        service = self._service()
        prepared = self._prepare(service, image_bytes("PNG"))
        path = self.storage.resolve(prepared.storage_key)
        self.assertTrue(path.exists())

        service.cleanup_prepared(prepared)
        self.assertFalse(path.exists())
        with self.assertRaises(SourceBinaryCleanupError):
            service.cleanup_prepared(prepared)

        external = PreparedSourceBinary(
            original_filename=None, mime_type="image/png", size_bytes=1,
            sha256="0" * 64, storage_key="outside/not-issued.png",
            width_px=1, height_px=1,
        )
        with self.assertRaises(SourceBinaryCleanupError):
            service.cleanup_prepared(external)

    def test_storage_failure_is_translated_and_leaves_no_orphan(self) -> None:
        storage = MagicMock(wraps=self.storage)
        storage.promote.side_effect = MediaStorageError("promotion failed")
        service = self._service(storage=storage)
        with self.assertRaises(SourceBinaryStorageError):
            self._prepare(service, image_bytes("PNG"))
        self.assertEqual(self._files(), [])

    def test_cleanup_failure_is_distinct(self) -> None:
        storage = MagicMock(wraps=self.storage)
        service = self._service(storage=storage)
        prepared = self._prepare(service, image_bytes("PNG"))
        storage.remove_key.side_effect = MediaStorageError("remove failed")
        with self.assertRaises(SourceBinaryCleanupError):
            service.cleanup_prepared(prepared)

    def test_prepared_dto_is_frozen_slotted_and_service_has_no_database_boundary(self) -> None:
        service = self._service()
        prepared = self._prepare(service, image_bytes("PNG"))
        self.assertFalse(hasattr(prepared, "__dict__"))
        with self.assertRaises(FrozenInstanceError):
            prepared.mime_type = "other"  # type: ignore[misc]
        signature = inspect.signature(SourceBinaryService)
        self.assertNotIn("db", signature.parameters)
        self.assertNotIn("session", signature.parameters)
        for forbidden in (
            "db", "add", "flush", "commit", "rollback", "MediaAsset",
            "SourceDocument", "SourceDocumentPage", "SourcePreAnalysisRun",
            "ocr", "openai", "ai_provider",
        ):
            self.assertNotIn(forbidden, vars(service))


if __name__ == "__main__":
    unittest.main()
