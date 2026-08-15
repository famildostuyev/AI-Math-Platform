from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.schemas.structured_text import (
    STRUCTURED_TEXT_FORMAT_VERSION,
    StructuredTextDocument,
    legacy_source_text_to_document,
    project_source_text,
)


class UnsupportedStructuredTextVersionError(ValueError):
    """Raised when structured text uses an unsupported format version."""


@dataclass(frozen=True, slots=True)
class StructuredTextPersistenceValues:
    """Canonical values ready for TextBlockContent persistence."""

    source_text: str
    document_data: dict[str, object]
    format_version: int


def prepare_structured_text_write(
    document: StructuredTextDocument | Mapping[str, object],
    format_version: int = STRUCTURED_TEXT_FORMAT_VERSION,
) -> StructuredTextPersistenceValues:
    """Validate one AST and derive all canonical persistence values."""

    _validate_format_version(format_version)
    validated_document = _validate_document(document)

    return StructuredTextPersistenceValues(
        source_text=project_source_text(validated_document),
        document_data=validated_document.model_dump(mode="json"),
        format_version=format_version,
    )


def normalize_text_content(
    *,
    source_text: str,
    document_data: Mapping[str, object] | None,
    format_version: int,
) -> StructuredTextDocument:
    """Return a validated AST for structured or legacy persisted values."""

    _validate_format_version(format_version)
    if document_data is None:
        return legacy_source_text_to_document(source_text)
    return StructuredTextDocument.model_validate(document_data)


def _validate_format_version(format_version: int) -> None:
    if (
        type(format_version) is not int
        or format_version != STRUCTURED_TEXT_FORMAT_VERSION
    ):
        raise UnsupportedStructuredTextVersionError(
            f"Unsupported structured-text format version: {format_version!r}."
        )


def _validate_document(
    document: StructuredTextDocument | Mapping[str, object],
) -> StructuredTextDocument:
    if isinstance(document, StructuredTextDocument):
        return document
    return StructuredTextDocument.model_validate(document)
