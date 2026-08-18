from __future__ import annotations

import tempfile
import unittest
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))


from app.storage.media_storage import (
    LocalMediaStorage,
    MediaStorageCollisionError,
    MediaStorageError,
    MediaStoragePathError,
)


class LocalMediaStorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "media"
        self.storage = LocalMediaStorage(self.root)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_nested_key_resolves_under_root_and_creates_parent_on_promotion(self) -> None:
        key = "images/2026/08/asset.png"
        resolved = self.storage.resolve(key)
        self.assertTrue(resolved.is_relative_to(self.root.resolve()))
        temporary = self.storage.create_temporary()
        with self.storage.open_temporary(temporary) as output:
            output.write(b"image-bytes")
        final = self.storage.promote(temporary, key)
        self.assertEqual(final, resolved)
        self.assertEqual(final.read_bytes(), b"image-bytes")
        self.assertFalse(temporary.exists())

    def test_promotion_collision_refuses_overwrite(self) -> None:
        key = "images/2026/08/existing.png"
        final = self.storage.resolve(key)
        final.parent.mkdir(parents=True)
        final.write_bytes(b"original")
        temporary = self.storage.create_temporary()
        with self.storage.open_temporary(temporary) as output:
            output.write(b"replacement")
        with self.assertRaises(MediaStorageCollisionError):
            self.storage.promote(temporary, key)
        self.assertEqual(final.read_bytes(), b"original")
        self.assertTrue(temporary.exists())

    def test_absolute_and_traversal_keys_are_rejected(self) -> None:
        keys = (
            "/absolute/image.png",
            "../outside.png",
            "images/../../outside.png",
            r"..\outside.png",
            r"C:\outside.png",
            r"images\..\outside.png",
            "C:/outside.png",
        )
        for key in keys:
            with self.subTest(key=key), self.assertRaises(MediaStoragePathError):
                self.storage.resolve(key)

    def test_safe_removal_cannot_remove_unrelated_file(self) -> None:
        unrelated = Path(self.temporary_directory.name) / "unrelated.txt"
        unrelated.write_text("keep", encoding="utf-8")
        with self.assertRaises(MediaStoragePathError):
            self.storage.remove_temporary(unrelated)
        self.assertTrue(unrelated.exists())

        key = "images/2026/08/removable.png"
        final = self.storage.resolve(key)
        final.parent.mkdir(parents=True)
        final.write_bytes(b"remove")
        self.storage.remove_key(key)
        self.assertFalse(final.exists())

    def test_temporary_file_is_unique_confined_and_removable(self) -> None:
        first = self.storage.create_temporary()
        second = self.storage.create_temporary()
        self.assertNotEqual(first, second)
        self.assertTrue(first.is_relative_to(self.root.resolve()))
        self.assertTrue(second.is_relative_to(self.root.resolve()))
        self.storage.remove_temporary(first)
        self.storage.remove_temporary(second)
        self.assertFalse(first.exists())
        self.assertFalse(second.exists())

    def test_open_key_reads_exact_bytes_in_binary_mode_without_writing(self) -> None:
        key = "sources/2026/08/book.pdf"
        final = self.storage.resolve(key)
        final.parent.mkdir(parents=True)
        contents = b"\x00%PDF-source\xff"
        final.write_bytes(contents)
        before = final.stat()

        with self.storage.open_key(key) as source:
            self.assertEqual(source.read(), contents)
            self.assertIn("b", source.mode)
            self.assertFalse(source.writable())

        after = final.stat()
        self.assertEqual(after.st_size, before.st_size)
        self.assertEqual(final.read_bytes(), contents)
        self.assertTrue(final.is_relative_to(self.root.resolve()))

    def test_open_key_translates_missing_or_unreadable_object(self) -> None:
        with self.assertRaises(MediaStorageError):
            self.storage.open_key("sources/2026/08/missing.pdf")

    def test_open_key_rejects_absolute_and_traversal_keys(self) -> None:
        for key in (
            "/absolute.pdf", "../outside.pdf", "sources/../../outside.pdf",
            r"C:\outside.pdf", r"sources\..\outside.pdf", "C:/outside.pdf",
        ):
            with self.subTest(key=key), self.assertRaises(MediaStoragePathError):
                self.storage.open_key(key)


if __name__ == "__main__":
    unittest.main()
