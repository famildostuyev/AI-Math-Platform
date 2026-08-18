from __future__ import annotations

import uuid

from PIL import Image, UnidentifiedImageError

from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    SourcePreAnalysisProcessorProvenance,
    SourcePreAnalysisProcessorResult,
)


IMAGE_MIME_TO_FORMAT = {
    "image/png": "PNG",
    "image/jpeg": "JPEG",
    "image/webp": "WEBP",
}
IMAGE_PROCESSOR_NAME = "image-pre-analysis"
IMAGE_PROCESSOR_VERSION = "1"


class ImageSourcePreAnalysisProcessorError(Exception):
    """Base exception for deterministic image pre-analysis failures."""


class ImageSourcePreAnalysisValidationError(
    ImageSourcePreAnalysisProcessorError
):
    """Raised when resolved image source metadata is invalid."""


class ImageSourcePreAnalysisUnreadableError(
    ImageSourcePreAnalysisProcessorError
):
    """Raised when the stored image or its stream cannot be read."""


class ImageSourcePreAnalysisMetadataMismatchError(
    ImageSourcePreAnalysisProcessorError
):
    """Raised when stored metadata disagrees with the image binary."""


class ImageSourcePreAnalysisUnsupportedContentError(
    ImageSourcePreAnalysisProcessorError
):
    """Raised when structurally valid image content is unsupported."""


class ImageSourcePreAnalysisProcessor:
    """Verify one static image and produce a lightweight result contract."""

    supported_mime_types = frozenset(IMAGE_MIME_TO_FORMAT)

    def process(
        self,
        *,
        source: ResolvedSourceBinary,
    ) -> SourcePreAnalysisProcessorExecution:
        self._validate_source(source)
        stream = source.stream
        try:
            original_position = stream.tell()
            stream.seek(0)
        except Exception as exc:
            raise ImageSourcePreAnalysisValidationError(
                "Resolved image stream must be seekable."
            ) from exc

        try:
            execution = self._process_stream(source)
        finally:
            try:
                stream.seek(original_position)
            except Exception as exc:
                raise ImageSourcePreAnalysisUnreadableError(
                    "Image stream position could not be restored."
                ) from exc
        return execution

    @staticmethod
    def _validate_source(source: ResolvedSourceBinary) -> None:
        if type(source) is not ResolvedSourceBinary:
            raise ImageSourcePreAnalysisValidationError(
                "Resolved image source is invalid."
            )
        if (
            type(source.source_document_id) is not uuid.UUID
            or type(source.media_asset_id) is not uuid.UUID
            or source.mime_type not in IMAGE_MIME_TO_FORMAT
            or type(source.size_bytes) is not int
            or source.size_bytes <= 0
            or type(source.width_px) is not int
            or source.width_px <= 0
            or type(source.height_px) is not int
            or source.height_px <= 0
        ):
            raise ImageSourcePreAnalysisValidationError(
                "Resolved image metadata is invalid."
            )

    @staticmethod
    def _process_stream(
        source: ResolvedSourceBinary,
    ) -> SourcePreAnalysisProcessorExecution:
        try:
            image = Image.open(source.stream)
            detected_format = image.format
            actual_size = image.size
            frame_count = getattr(image, "n_frames", 1)

            expected_format = IMAGE_MIME_TO_FORMAT[source.mime_type]
            if detected_format != expected_format:
                raise ImageSourcePreAnalysisMetadataMismatchError(
                    "Image format does not match persisted MIME metadata."
                )
            if actual_size != (source.width_px, source.height_px):
                raise ImageSourcePreAnalysisMetadataMismatchError(
                    "Image dimensions do not match persisted metadata."
                )
            if type(frame_count) is not int or frame_count != 1:
                raise ImageSourcePreAnalysisUnsupportedContentError(
                    "Multiframe image sources are unsupported."
                )

            image.verify()
        except (
            ImageSourcePreAnalysisMetadataMismatchError,
            ImageSourcePreAnalysisUnsupportedContentError,
        ):
            raise
        except (
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            ValueError,
            TypeError,
        ) as exc:
            raise ImageSourcePreAnalysisUnreadableError(
                "Image source content is unreadable."
            ) from exc
        except Exception as exc:
            raise ImageSourcePreAnalysisUnreadableError(
                "Image source could not be processed."
            ) from exc

        return SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=1,
                findings=(),
            ),
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name=IMAGE_PROCESSOR_NAME,
                processor_version=IMAGE_PROCESSOR_VERSION,
                provider_name=None,
                model_name=None,
                prompt_version=None,
            ),
        )
