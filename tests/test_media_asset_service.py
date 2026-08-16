from __future__ import annotations

import hashlib
import io
import tempfile
import unittest
import uuid
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image
from sqlalchemy.exc import IntegrityError

from app.models.media_asset import MediaAsset
from app.schemas.media_asset import MediaAssetRead
from app.services.media_asset_service import (
    EmptyImageError,
    ImageDimensionsError,
    ImageTooLargeError,
    InvalidImageError,
    MediaAssetService,
    MediaAssetStorageError,
)
from app.storage.media_storage import LocalMediaStorage, MediaStorageError


NOW = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


def image_bytes(image_format: str, size: tuple[int, int] = (3, 2)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color=(20, 40, 60)).save(output, format=image_format)
    return output.getvalue()


class MediaAssetServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "media"
        self.storage = LocalMediaStorage(self.root)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _db(self) -> MagicMock:
        db = MagicMock()

        def assign_values(asset: MediaAsset) -> None:
            asset.id = uuid.uuid4()
            asset.created_at = NOW

        db.add.side_effect = assign_values
        return db

    def _service(
        self,
        db: MagicMock,
        *,
        storage: LocalMediaStorage | None = None,
        max_bytes: int = 10 * 1024 * 1024,
        max_pixels: int = 40_000_000,
    ) -> MediaAssetService:
        return MediaAssetService(
            db,
            storage=storage or self.storage,
            max_image_bytes=max_bytes,
            max_image_pixels=max_pixels,
        )

    def _files(self) -> list[Path]:
        return [path for path in self.root.rglob("*") if path.is_file()]

    def test_png_jpeg_and_webp_persist_canonical_metadata(self) -> None:
        cases = (
            ("PNG", "image/png", ".png"),
            ("JPEG", "image/jpeg", ".jpg"),
            ("WEBP", "image/webp", ".webp"),
        )
        for image_format, mime_type, extension in cases:
            with self.subTest(image_format=image_format):
                data = image_bytes(image_format)
                db = self._db()
                response = self._service(db).create_image_asset(
                    upload=io.BytesIO(data),
                    original_filename=f"diagram.{image_format.lower()}",
                    submitted_mime_type="application/octet-stream",
                )
                asset = db.add.call_args.args[0]
                self.assertIsInstance(asset, MediaAsset)
                self.assertEqual(asset.mime_type, mime_type)
                self.assertTrue(asset.storage_key.startswith("images/"))
                self.assertTrue(asset.storage_key.endswith(extension))
                self.assertRegex(
                    asset.storage_key,
                    rf"^images/\d{{4}}/\d{{2}}/[0-9a-f-]{{36}}\{extension}$",
                )
                self.assertEqual(asset.size_bytes, len(data))
                self.assertEqual(asset.sha256, hashlib.sha256(data).hexdigest())
                self.assertEqual((asset.width_px, asset.height_px), (3, 2))
                self.assertIsInstance(response, MediaAssetRead)
                self.assertEqual(
                    set(response.model_dump()),
                    {
                        "id", "original_filename", "mime_type", "size_bytes",
                        "width_px", "height_px", "created_at",
                    },
                )
                self.assertFalse(hasattr(response, "storage_key"))
                self.assertFalse(hasattr(response, "sha256"))
                self.assertEqual(
                    self.storage.resolve(asset.storage_key).read_bytes(), data,
                )
                db.commit.assert_called_once_with()
                db.refresh.assert_called_once_with(asset)
                db.rollback.assert_not_called()

    def test_filename_is_display_metadata_only_and_safely_normalized(self) -> None:
        cases = (
            (None, None),
            ("graph.png", "graph.png"),
            (r"C:\private\graph.png", "graph.png"),
            ("../../private/graph.png", "graph.png"),
            ("bad\r\nname.png", "badname.png"),
            ("x" * 300 + ".png", "x" * 255),
        )
        for supplied, expected in cases:
            with self.subTest(supplied=supplied):
                db = self._db()
                self._service(db).create_image_asset(
                    upload=io.BytesIO(image_bytes("PNG")),
                    original_filename=supplied,
                )
                self.assertEqual(db.add.call_args.args[0].original_filename, expected)

    def test_empty_random_corrupt_and_unsupported_images_are_rejected_and_cleaned(self) -> None:
        png = image_bytes("PNG")
        cases = (
            (b"", EmptyImageError),
            (b"not an image", InvalidImageError),
            (png[:20], InvalidImageError),
            (image_bytes("BMP"), InvalidImageError),
        )
        for data, error in cases:
            with self.subTest(error=error.__name__):
                db = self._db()
                with self.assertRaises(error):
                    self._service(db).create_image_asset(
                        upload=io.BytesIO(data), original_filename="image.bin",
                    )
                self.assertEqual(self._files(), [])
                db.rollback.assert_called_once_with()
                db.commit.assert_not_called()

    def test_encoded_size_and_pixel_limits_are_enforced(self) -> None:
        data = image_bytes("PNG", (2, 2))
        db = self._db()
        with self.assertRaises(ImageTooLargeError):
            self._service(db, max_bytes=len(data) - 1).create_image_asset(
                upload=io.BytesIO(data), original_filename="large.png",
            )
        self.assertEqual(self._files(), [])

        db = self._db()
        with self.assertRaises(ImageDimensionsError):
            self._service(db, max_pixels=3).create_image_asset(
                upload=io.BytesIO(data), original_filename="pixels.png",
            )
        self.assertEqual(self._files(), [])

    def test_extension_and_submitted_mime_do_not_control_persisted_type(self) -> None:
        db = self._db()
        self._service(db).create_image_asset(
            upload=io.BytesIO(image_bytes("PNG")),
            original_filename="misleading.svg",
            submitted_mime_type="image/jpeg",
        )
        asset = db.add.call_args.args[0]
        self.assertEqual(asset.mime_type, "image/png")
        self.assertTrue(asset.storage_key.endswith(".png"))

    def test_identical_bytes_create_distinct_rows_and_storage_keys(self) -> None:
        data = image_bytes("PNG")
        assets = []
        for _ in range(2):
            db = self._db()
            self._service(db).create_image_asset(
                upload=io.BytesIO(data), original_filename="same.png",
            )
            assets.append(db.add.call_args.args[0])
        self.assertEqual(assets[0].sha256, assets[1].sha256)
        self.assertNotEqual(assets[0].storage_key, assets[1].storage_key)
        self.assertEqual(len(self._files()), 2)

    def test_storage_failure_rolls_back_and_removes_temporary_file(self) -> None:
        storage = MagicMock(wraps=self.storage)
        storage.promote.side_effect = MediaStorageError("promotion failed")
        db = self._db()
        with self.assertRaises(MediaAssetStorageError):
            self._service(db, storage=storage).create_image_asset(
                upload=io.BytesIO(image_bytes("PNG")),
                original_filename="graph.png",
            )
        self.assertEqual(self._files(), [])
        db.rollback.assert_called_once_with()
        db.add.assert_not_called()

    def test_database_failure_rolls_back_and_removes_promoted_file(self) -> None:
        db = self._db()
        failure = IntegrityError("insert", {}, Exception("database failure"))
        db.commit.side_effect = failure
        with self.assertRaises(IntegrityError) as raised:
            self._service(db).create_image_asset(
                upload=io.BytesIO(image_bytes("PNG")),
                original_filename="graph.png",
            )
        self.assertIs(raised.exception, failure)
        self.assertEqual(self._files(), [])
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
