from __future__ import annotations

import uuid
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree

from app.core.config import settings
from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    SourcePreAnalysisProcessorFinding,
    SourcePreAnalysisProcessorProvenance,
    SourcePreAnalysisProcessorResult,
)


DOCX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document"
)
DOCX_PROCESSOR_NAME = "docx-pre-analysis"
DOCX_PROCESSOR_VERSION = "1"

DOCX_NO_TEXT_CONTENT = "docx_no_text_content"
DOCX_MATH_PRESENT = "docx_math_present"
DOCX_TABLE_PRESENT = "docx_table_present"
DOCX_DRAWING_PRESENT = "docx_drawing_present"

DOCX_NO_TEXT_CONTENT_MESSAGE = (
    "No extractable text was detected in the main document."
)
DOCX_MATH_PRESENT_MESSAGE = "Document contains Word equation content."
DOCX_TABLE_PRESENT_MESSAGE = "Document contains one or more tables."
DOCX_DRAWING_PRESENT_MESSAGE = (
    "Document contains drawing or picture content."
)

_REQUIRED_MEMBERS = {
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
}
_MAIN_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document.main+xml"
)
_CONTENT_TYPES_NAMESPACE = (
    "http://schemas.openxmlformats.org/package/2006/content-types"
)
_WORD_NAMESPACE = (
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
)
_MATH_NAMESPACE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/math"
)
_FORBIDDEN_XML_MARKERS = (b"<!DOCTYPE", b"<!ENTITY")


class DocxSourcePreAnalysisProcessorError(Exception):
    """Base exception for deterministic DOCX pre-analysis failures."""


class DocxSourcePreAnalysisValidationError(
    DocxSourcePreAnalysisProcessorError
):
    """Raised when the resolved DOCX source contract is invalid."""


class DocxSourcePreAnalysisUnreadableError(
    DocxSourcePreAnalysisProcessorError
):
    """Raised when the DOCX archive or its stream cannot be read."""


class DocxSourcePreAnalysisStructureError(
    DocxSourcePreAnalysisProcessorError
):
    """Raised when DOCX package structure is invalid or unsafe."""


class DocxSourcePreAnalysisProcessor:
    """Produce deterministic main-document structure findings for DOCX."""

    supported_mime_types = frozenset({DOCX_MIME_TYPE})

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
            raise DocxSourcePreAnalysisValidationError(
                "Resolved DOCX stream must be seekable."
            ) from exc

        try:
            execution = self._process_stream(stream)
        finally:
            try:
                stream.seek(original_position)
            except Exception as exc:
                raise DocxSourcePreAnalysisUnreadableError(
                    "DOCX stream position could not be restored."
                ) from exc
        return execution

    @staticmethod
    def _validate_source(source: ResolvedSourceBinary) -> None:
        if type(source) is not ResolvedSourceBinary:
            raise DocxSourcePreAnalysisValidationError(
                "Resolved DOCX source is invalid."
            )
        if (
            type(source.source_document_id) is not uuid.UUID
            or type(source.media_asset_id) is not uuid.UUID
            or source.mime_type != DOCX_MIME_TYPE
            or type(source.size_bytes) is not int
            or source.size_bytes <= 0
            or source.width_px is not None
            or source.height_px is not None
        ):
            raise DocxSourcePreAnalysisValidationError(
                "Resolved DOCX metadata is invalid."
            )

    @classmethod
    def _process_stream(cls, stream: object) -> SourcePreAnalysisProcessorExecution:
        try:
            with zipfile.ZipFile(stream) as archive:
                members = archive.infolist()
                cls._validate_members(members)
                names = {member.filename for member in members}
                if not _REQUIRED_MEMBERS.issubset(names):
                    raise DocxSourcePreAnalysisStructureError(
                        "DOCX package structure is incomplete."
                    )
                try:
                    content_types = archive.read("[Content_Types].xml")
                    relationships = archive.read("_rels/.rels")
                    document = archive.read("word/document.xml")
                except (KeyError, OSError, RuntimeError, zipfile.BadZipFile) as exc:
                    raise DocxSourcePreAnalysisUnreadableError(
                        "Required DOCX package content is unreadable."
                    ) from exc
        except (
            DocxSourcePreAnalysisStructureError,
            DocxSourcePreAnalysisUnreadableError,
        ):
            raise
        except (zipfile.BadZipFile, OSError, RuntimeError, ValueError) as exc:
            raise DocxSourcePreAnalysisUnreadableError(
                "DOCX source archive is unreadable."
            ) from exc
        except Exception as exc:
            raise DocxSourcePreAnalysisUnreadableError(
                "DOCX source could not be processed."
            ) from exc

        content_types_root = cls._parse_required_xml(content_types)
        cls._parse_required_xml(relationships)
        document_root = cls._parse_required_xml(document)
        cls._validate_main_content_type(content_types_root)

        tags = {element.tag for element in document_root.iter()}
        has_text = any(
            element.tag == f"{{{_WORD_NAMESPACE}}}t"
            and isinstance(element.text, str)
            and bool(element.text.strip())
            for element in document_root.iter()
        )
        has_math = bool(
            tags
            & {
                f"{{{_MATH_NAMESPACE}}}oMath",
                f"{{{_MATH_NAMESPACE}}}oMathPara",
            }
        )
        has_table = f"{{{_WORD_NAMESPACE}}}tbl" in tags
        has_drawing = bool(
            tags
            & {
                f"{{{_WORD_NAMESPACE}}}drawing",
                f"{{{_WORD_NAMESPACE}}}pict",
            }
        )

        findings: list[SourcePreAnalysisProcessorFinding] = []
        if not has_text:
            findings.append(cls._finding(
                DOCX_NO_TEXT_CONTENT,
                SourcePreAnalysisFindingSeverity.WARNING,
                DOCX_NO_TEXT_CONTENT_MESSAGE,
            ))
        if has_math:
            findings.append(cls._finding(
                DOCX_MATH_PRESENT,
                SourcePreAnalysisFindingSeverity.INFO,
                DOCX_MATH_PRESENT_MESSAGE,
            ))
        if has_table:
            findings.append(cls._finding(
                DOCX_TABLE_PRESENT,
                SourcePreAnalysisFindingSeverity.INFO,
                DOCX_TABLE_PRESENT_MESSAGE,
            ))
        if has_drawing:
            findings.append(cls._finding(
                DOCX_DRAWING_PRESENT,
                SourcePreAnalysisFindingSeverity.INFO,
                DOCX_DRAWING_PRESENT_MESSAGE,
            ))

        return SourcePreAnalysisProcessorExecution(
            result=SourcePreAnalysisProcessorResult(
                schema_version=1,
                page_count=None,
                findings=tuple(findings),
            ),
            provenance=SourcePreAnalysisProcessorProvenance(
                processor_name=DOCX_PROCESSOR_NAME,
                processor_version=DOCX_PROCESSOR_VERSION,
                provider_name=None,
                model_name=None,
                prompt_version=None,
            ),
        )

    @staticmethod
    def _validate_members(members: list[zipfile.ZipInfo]) -> None:
        if len(members) > settings.MEDIA_MAX_DOCX_MEMBERS:
            raise DocxSourcePreAnalysisStructureError(
                "DOCX archive exceeds the member limit."
            )
        expanded_size = 0
        for member in members:
            name = member.filename
            path = PurePosixPath(name)
            original_name = member.orig_filename
            if (
                not name
                or not original_name
                or "\\" in name
                or "\\" in original_name
                or path.is_absolute()
                or any(part in {"", ".", ".."} for part in path.parts)
                or ":" in path.parts[0]
                or member.flag_bits & 0x1
            ):
                raise DocxSourcePreAnalysisStructureError(
                    "DOCX archive contains an unsafe member."
                )
            expanded_size += member.file_size
            if expanded_size > settings.MEDIA_MAX_DOCX_EXPANDED_BYTES:
                raise DocxSourcePreAnalysisStructureError(
                    "DOCX archive exceeds the expanded-size limit."
                )

    @staticmethod
    def _parse_required_xml(content: bytes) -> ElementTree.Element:
        upper_content = content.upper()
        if any(marker in upper_content for marker in _FORBIDDEN_XML_MARKERS):
            raise DocxSourcePreAnalysisStructureError(
                "DOCX package contains a forbidden XML declaration."
            )
        try:
            return ElementTree.fromstring(content)
        except (ElementTree.ParseError, ValueError, TypeError) as exc:
            raise DocxSourcePreAnalysisStructureError(
                "Required DOCX XML is malformed."
            ) from exc

    @staticmethod
    def _validate_main_content_type(root: ElementTree.Element) -> None:
        overrides = root.iter(f"{{{_CONTENT_TYPES_NAMESPACE}}}Override")
        if not any(
            override.attrib.get("PartName") == "/word/document.xml"
            and override.attrib.get("ContentType") == _MAIN_CONTENT_TYPE
            for override in overrides
        ):
            raise DocxSourcePreAnalysisStructureError(
                "DOCX main document content type is unavailable."
            )

    @staticmethod
    def _finding(
        code: str,
        severity: SourcePreAnalysisFindingSeverity,
        message: str,
    ) -> SourcePreAnalysisProcessorFinding:
        return SourcePreAnalysisProcessorFinding(
            page_number=None,
            finding_code=code,
            severity=severity,
            confidence=None,
            message=message,
        )
