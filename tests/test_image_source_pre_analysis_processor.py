from __future__ import annotations

import sys
import unittest
import uuid
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from PIL import Image

from app.services.image_source_pre_analysis_processor import (
    IMAGE_MIME_TO_FORMAT,
    IMAGE_PROCESSOR_NAME,
    IMAGE_PROCESSOR_VERSION,
    ImageSourcePreAnalysisMetadataMismatchError,
    ImageSourcePreAnalysisProcessor,
    ImageSourcePreAnalysisUnreadableError,
    ImageSourcePreAnalysisUnsupportedContentError,
    ImageSourcePreAnalysisValidationError,
)
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    validate_processor_execution,
)


class ImageSourcePreAnalysisProcessorTest(unittest.TestCase):
    @staticmethod
    def _image_bytes(
        image_format: str,
        *,
        size: tuple[int, int] = (3, 2),
    ) -> bytes:
        image = Image.new("RGB", size, (30, 60, 90))
        stream = BytesIO()
        image.save(stream, format=image_format)
        return stream.getvalue()

    @staticmethod
    def _source(
        content: bytes,
        *,
        mime_type: str,
        width_px: object = 3,
        height_px: object = 2,
        size_bytes: object | None = None,
        stream: BytesIO | None = None,
    ) -> ResolvedSourceBinary:
        return ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type=mime_type,
            original_filename="source.image",
            size_bytes=(len(content) if size_bytes is None else size_bytes),
            width_px=width_px,
            height_px=height_px,
            stream=stream or BytesIO(content),
        )  # type: ignore[arg-type]

    def test_contract_accepts_exact_three_formats_with_zero_findings(self) -> None:
        processor = ImageSourcePreAnalysisProcessor()
        self.assertEqual(
            processor.supported_mime_types,
            frozenset(IMAGE_MIME_TO_FORMAT),
        )
        for mime_type, image_format in IMAGE_MIME_TO_FORMAT.items():
            with self.subTest(mime_type=mime_type):
                content = self._image_bytes(image_format)
                stream = BytesIO(content)
                stream.seek(5)
                source = self._source(
                    content,
                    mime_type=mime_type,
                    stream=stream,
                )
                identity = (
                    source.source_document_id,
                    source.media_asset_id,
                    source.mime_type,
                    source.size_bytes,
                    source.width_px,
                    source.height_px,
                )

                execution = processor.process(source=source)

                self.assertIsInstance(
                    execution,
                    SourcePreAnalysisProcessorExecution,
                )
                self.assertEqual(execution.result.schema_version, 1)
                self.assertEqual(execution.result.page_count, 1)
                self.assertEqual(execution.result.findings, ())
                self.assertEqual(stream.tell(), 5)
                self.assertFalse(stream.closed)
                self.assertEqual(
                    (
                        source.source_document_id,
                        source.media_asset_id,
                        source.mime_type,
                        source.size_bytes,
                        source.width_px,
                        source.height_px,
                    ),
                    identity,
                )
                provenance = execution.provenance
                self.assertEqual(provenance.processor_name, IMAGE_PROCESSOR_NAME)
                self.assertEqual(
                    provenance.processor_version,
                    IMAGE_PROCESSOR_VERSION,
                )
                self.assertIsNone(provenance.provider_name)
                self.assertIsNone(provenance.model_name)
                self.assertIsNone(provenance.prompt_version)
                self.assertEqual(
                    validate_processor_execution(execution),
                    execution,
                )

    def test_wrong_contract_mime_and_basic_metadata_are_rejected(self) -> None:
        content = self._image_bytes("PNG")
        valid = self._source(content, mime_type="image/png")
        invalid_sources = (
            object(),
            replace(valid, source_document_id="bad"),
            replace(valid, media_asset_id="bad"),
            replace(valid, mime_type="application/pdf"),
            replace(valid, size_bytes=0),
            replace(valid, size_bytes=True),
            replace(valid, width_px=None),
            replace(valid, width_px=0),
            replace(valid, width_px=True),
            replace(valid, height_px=None),
            replace(valid, height_px=-1),
            replace(valid, height_px=False),
        )
        for invalid in invalid_sources:
            with self.subTest(invalid=repr(invalid)), self.assertRaises(
                ImageSourcePreAnalysisValidationError,
            ):
                ImageSourcePreAnalysisProcessor().process(
                    source=invalid,  # type: ignore[arg-type]
                )

    def test_processing_starts_at_zero_and_verify_is_exercised(self) -> None:
        content = self._image_bytes("PNG")
        stream = BytesIO(content)
        stream.seek(9)
        fake_image = MagicMock()
        fake_image.format = "PNG"
        fake_image.size = (3, 2)
        fake_image.n_frames = 1

        def open_image(received_stream):
            self.assertIs(received_stream, stream)
            self.assertEqual(received_stream.tell(), 0)
            return fake_image

        with patch(
            "app.services.image_source_pre_analysis_processor.Image.open",
            side_effect=open_image,
        ):
            ImageSourcePreAnalysisProcessor().process(
                source=self._source(
                    content,
                    mime_type="image/png",
                    stream=stream,
                ),
            )

        fake_image.verify.assert_called_once_with()
        self.assertEqual(stream.tell(), 9)
        self.assertFalse(stream.closed)

    def test_unusable_stream_and_restore_failure_are_fatal(self) -> None:
        class UnusableStream(BytesIO):
            def tell(self) -> int:
                raise OSError("not seekable")

        content = self._image_bytes("PNG")
        unusable = UnusableStream(content)
        with self.assertRaises(ImageSourcePreAnalysisValidationError):
            ImageSourcePreAnalysisProcessor().process(
                source=self._source(
                    content,
                    mime_type="image/png",
                    stream=unusable,
                ),
            )
        self.assertFalse(unusable.closed)

        class RestoreFailureStream(BytesIO):
            def __init__(self, value: bytes) -> None:
                super().__init__(value)
                self.fail_restore = False

            def seek(self, offset: int, whence: int = 0) -> int:
                if self.fail_restore and offset == 5 and whence == 0:
                    raise OSError("restore failed")
                return super().seek(offset, whence)

        restore_stream = RestoreFailureStream(content)
        restore_stream.seek(5)
        fake_image = MagicMock(
            format="PNG",
            size=(3, 2),
            n_frames=1,
        )
        restore_stream.fail_restore = True
        with patch(
            "app.services.image_source_pre_analysis_processor.Image.open",
            return_value=fake_image,
        ), self.assertRaises(ImageSourcePreAnalysisUnreadableError):
            ImageSourcePreAnalysisProcessor().process(
                source=self._source(
                    content,
                    mime_type="image/png",
                    stream=restore_stream,
                ),
            )
        self.assertFalse(restore_stream.closed)

    def test_processing_failure_restores_position_without_leaking_details(
        self,
    ) -> None:
        content = self._image_bytes("PNG")[:20]
        stream = BytesIO(content)
        stream.seek(4)
        with self.assertRaises(ImageSourcePreAnalysisUnreadableError) as raised:
            ImageSourcePreAnalysisProcessor().process(
                source=self._source(
                    content,
                    mime_type="image/png",
                    stream=stream,
                ),
            )
        self.assertEqual(stream.tell(), 4)
        self.assertFalse(stream.closed)
        self.assertNotIn(repr(content), str(raised.exception))

    def test_format_mismatches_are_fatal_and_never_rewrite_metadata(self) -> None:
        cases = (
            ("PNG", "image/jpeg"),
            ("JPEG", "image/png"),
            ("WEBP", "image/png"),
        )
        for image_format, declared_mime in cases:
            with self.subTest(
                image_format=image_format,
                declared_mime=declared_mime,
            ):
                content = self._image_bytes(image_format)
                source = self._source(content, mime_type=declared_mime)
                with self.assertRaises(
                    ImageSourcePreAnalysisMetadataMismatchError,
                ):
                    ImageSourcePreAnalysisProcessor().process(source=source)
                self.assertEqual(source.mime_type, declared_mime)
                self.assertEqual((source.width_px, source.height_px), (3, 2))
                self.assertFalse(source.stream.closed)

    def test_dimension_mismatches_are_fatal_and_not_rewritten(self) -> None:
        content = self._image_bytes("PNG", size=(4, 3))
        for width, height in ((3, 3), (4, 2)):
            with self.subTest(width=width, height=height):
                source = self._source(
                    content,
                    mime_type="image/png",
                    width_px=width,
                    height_px=height,
                )
                with self.assertRaises(
                    ImageSourcePreAnalysisMetadataMismatchError,
                ):
                    ImageSourcePreAnalysisProcessor().process(source=source)
                self.assertEqual((source.width_px, source.height_px), (width, height))

    def test_corrupt_supported_images_are_unreadable(self) -> None:
        for mime_type in IMAGE_MIME_TO_FORMAT:
            with self.subTest(mime_type=mime_type):
                content = b"corrupt-image-content"
                with self.assertRaises(ImageSourcePreAnalysisUnreadableError):
                    ImageSourcePreAnalysisProcessor().process(
                        source=self._source(content, mime_type=mime_type),
                    )

    def test_multiframe_image_is_rejected_and_never_becomes_page_count(self) -> None:
        frames = (
            Image.new("RGB", (3, 2), "red"),
            Image.new("RGB", (3, 2), "blue"),
        )
        stream = BytesIO()
        try:
            frames[0].save(
                stream,
                format="WEBP",
                save_all=True,
                append_images=[frames[1]],
                duration=100,
                loop=0,
            )
        except OSError as exc:
            self.skipTest(f"Animated WebP fixture is unavailable: {exc}")
        content = stream.getvalue()
        source_stream = BytesIO(content)
        source_stream.seek(3)

        with self.assertRaises(
            ImageSourcePreAnalysisUnsupportedContentError,
        ):
            ImageSourcePreAnalysisProcessor().process(
                source=self._source(
                    content,
                    mime_type="image/webp",
                    stream=source_stream,
                ),
            )
        self.assertEqual(source_stream.tell(), 3)
        self.assertFalse(source_stream.closed)


if __name__ == "__main__":
    unittest.main()
