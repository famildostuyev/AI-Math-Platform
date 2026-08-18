from __future__ import annotations

import os
import sys
import unittest
import uuid
import zipfile
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from unittest.mock import patch


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

from app.core.enums import SourcePreAnalysisFindingSeverity
from app.services.docx_source_pre_analysis_processor import (
    DOCX_DRAWING_PRESENT,
    DOCX_DRAWING_PRESENT_MESSAGE,
    DOCX_MATH_PRESENT,
    DOCX_MATH_PRESENT_MESSAGE,
    DOCX_MIME_TYPE,
    DOCX_NO_TEXT_CONTENT,
    DOCX_NO_TEXT_CONTENT_MESSAGE,
    DOCX_PROCESSOR_NAME,
    DOCX_PROCESSOR_VERSION,
    DOCX_TABLE_PRESENT,
    DOCX_TABLE_PRESENT_MESSAGE,
    DocxSourcePreAnalysisProcessor,
    DocxSourcePreAnalysisStructureError,
    DocxSourcePreAnalysisUnreadableError,
    DocxSourcePreAnalysisValidationError,
)
from app.services.source_pre_analysis_processor import (
    ResolvedSourceBinary,
    SourcePreAnalysisProcessorExecution,
    validate_processor_execution,
)


CONTENT_TYPES = b'''<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''
RELATIONSHIPS = b'''<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'''
DOCUMENT_PREFIX = (
    b'<w:document xmlns:w="http://schemas.openxmlformats.org/'
    b'wordprocessingml/2006/main" xmlns:m="http://schemas.'
    b'openxmlformats.org/officeDocument/2006/math"><w:body>'
)
DOCUMENT_SUFFIX = b"</w:body></w:document>"


class DocxSourcePreAnalysisProcessorTest(unittest.TestCase):
    @staticmethod
    def _docx(
        body: bytes = b"<w:p><w:r><w:t>Question</w:t></w:r></w:p>",
        *,
        content_types: bytes = CONTENT_TYPES,
        relationships: bytes = RELATIONSHIPS,
        document: bytes | None = None,
        omit: str | None = None,
        extra_members: tuple[tuple[str, bytes], ...] = (),
    ) -> bytes:
        stream = BytesIO()
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            members = (
                ("[Content_Types].xml", content_types),
                ("_rels/.rels", relationships),
                (
                    "word/document.xml",
                    document
                    if document is not None
                    else DOCUMENT_PREFIX + body + DOCUMENT_SUFFIX,
                ),
            )
            for name, value in (*members, *extra_members):
                if name != omit:
                    archive.writestr(name, value)
        return stream.getvalue()

    @staticmethod
    def _source(
        content: bytes,
        *,
        mime_type: str = DOCX_MIME_TYPE,
        size_bytes: object | None = None,
        width_px: object = None,
        height_px: object = None,
        stream: BytesIO | None = None,
    ) -> ResolvedSourceBinary:
        return ResolvedSourceBinary(
            source_document_id=uuid.uuid4(),
            media_asset_id=uuid.uuid4(),
            mime_type=mime_type,
            original_filename="questions.docx",
            size_bytes=len(content) if size_bytes is None else size_bytes,
            width_px=width_px,
            height_px=height_px,
            stream=stream or BytesIO(content),
        )  # type: ignore[arg-type]

    def test_text_document_contract_provenance_and_stream_ownership(self) -> None:
        content = self._docx()
        stream = BytesIO(content)
        stream.seek(7)
        source = self._source(content, stream=stream)
        identity = (
            source.source_document_id,
            source.media_asset_id,
            source.mime_type,
            source.size_bytes,
            source.width_px,
            source.height_px,
        )
        processor = DocxSourcePreAnalysisProcessor()

        execution = processor.process(source=source)

        self.assertEqual(processor.supported_mime_types, frozenset({DOCX_MIME_TYPE}))
        self.assertIsInstance(execution, SourcePreAnalysisProcessorExecution)
        self.assertEqual(execution.result.schema_version, 1)
        self.assertIsNone(execution.result.page_count)
        self.assertEqual(execution.result.findings, ())
        self.assertEqual(execution.provenance.processor_name, DOCX_PROCESSOR_NAME)
        self.assertEqual(execution.provenance.processor_version, DOCX_PROCESSOR_VERSION)
        self.assertIsNone(execution.provenance.provider_name)
        self.assertIsNone(execution.provenance.model_name)
        self.assertIsNone(execution.provenance.prompt_version)
        self.assertEqual(validate_processor_execution(execution), execution)
        self.assertEqual(stream.tell(), 7)
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

    def test_invalid_source_contract_and_metadata_are_rejected(self) -> None:
        content = self._docx()
        valid = self._source(content)
        invalid = (
            object(),
            replace(valid, source_document_id="bad"),
            replace(valid, media_asset_id="bad"),
            replace(valid, mime_type="application/zip"),
            replace(valid, size_bytes=0),
            replace(valid, size_bytes=True),
            replace(valid, width_px=1),
            replace(valid, height_px=1),
        )
        for source in invalid:
            with self.subTest(source=repr(source)), self.assertRaises(
                DocxSourcePreAnalysisValidationError,
            ):
                DocxSourcePreAnalysisProcessor().process(
                    source=source,  # type: ignore[arg-type]
                )

    def test_unusable_stream_and_restore_failure_are_fatal(self) -> None:
        class UnusableStream(BytesIO):
            def tell(self) -> int:
                raise OSError("unusable")

        content = self._docx()
        unusable = UnusableStream(content)
        with self.assertRaises(DocxSourcePreAnalysisValidationError):
            DocxSourcePreAnalysisProcessor().process(
                source=self._source(content, stream=unusable),
            )
        self.assertFalse(unusable.closed)

        class RestoreFailureStream(BytesIO):
            fail_restore = False

            def seek(self, offset: int, whence: int = 0) -> int:
                if self.fail_restore and offset == 4 and whence == 0:
                    raise OSError("restore")
                return super().seek(offset, whence)

        restore = RestoreFailureStream(content)
        restore.seek(4)
        restore.fail_restore = True
        with self.assertRaises(DocxSourcePreAnalysisUnreadableError):
            DocxSourcePreAnalysisProcessor().process(
                source=self._source(content, stream=restore),
            )
        self.assertFalse(restore.closed)

    def test_invalid_zip_restores_position_without_leaking_content(self) -> None:
        content = b"not a zip containing secret-document-text"
        stream = BytesIO(content)
        stream.seek(3)
        with self.assertRaises(DocxSourcePreAnalysisUnreadableError) as raised:
            DocxSourcePreAnalysisProcessor().process(
                source=self._source(content, stream=stream),
            )
        self.assertEqual(stream.tell(), 3)
        self.assertFalse(stream.closed)
        self.assertNotIn("secret-document-text", str(raised.exception))

    def test_required_members_and_main_content_type_are_enforced(self) -> None:
        for missing in (
            "[Content_Types].xml",
            "_rels/.rels",
            "word/document.xml",
        ):
            with self.subTest(missing=missing), self.assertRaises(
                DocxSourcePreAnalysisStructureError,
            ):
                content = self._docx(omit=missing)
                DocxSourcePreAnalysisProcessor().process(
                    source=self._source(content),
                )

        wrong = self._docx(
            content_types=CONTENT_TYPES.replace(b"main+xml", b"wrong+xml"),
        )
        with self.assertRaises(DocxSourcePreAnalysisStructureError):
            DocxSourcePreAnalysisProcessor().process(source=self._source(wrong))

    def test_unsafe_archive_names_and_encrypted_flag_are_rejected(self) -> None:
        for name in ("../escape", "word\\bad.xml", "/absolute", "C:drive"):
            with self.subTest(name=name), self.assertRaises(
                DocxSourcePreAnalysisStructureError,
            ):
                if "\\" in name:
                    normalized_name = name.replace("\\", "/")
                    content = self._docx(
                        extra_members=((normalized_name, b"x"),),
                    ).replace(
                        normalized_name.encode(),
                        name.encode(),
                    )
                else:
                    content = self._docx(extra_members=((name, b"x"),))
                DocxSourcePreAnalysisProcessor().process(
                    source=self._source(content),
                )

        content = self._docx()
        real_zip = zipfile.ZipFile

        class EncryptedZip(real_zip):
            def infolist(self):  # type: ignore[no-untyped-def]
                members = super().infolist()
                members[0].flag_bits |= 0x1
                return members

        with patch(
            "app.services.docx_source_pre_analysis_processor.zipfile.ZipFile",
            EncryptedZip,
        ), self.assertRaises(DocxSourcePreAnalysisStructureError):
            DocxSourcePreAnalysisProcessor().process(source=self._source(content))

    def test_configured_archive_limits_are_enforced(self) -> None:
        content = self._docx(extra_members=(("word/extra.xml", b"12345"),))
        with patch(
            "app.services.docx_source_pre_analysis_processor.settings.MEDIA_MAX_DOCX_MEMBERS",
            3,
        ), self.assertRaises(DocxSourcePreAnalysisStructureError):
            DocxSourcePreAnalysisProcessor().process(source=self._source(content))
        with patch(
            "app.services.docx_source_pre_analysis_processor.settings.MEDIA_MAX_DOCX_EXPANDED_BYTES",
            10,
        ), self.assertRaises(DocxSourcePreAnalysisStructureError):
            DocxSourcePreAnalysisProcessor().process(source=self._source(content))

    def test_malformed_and_forbidden_required_xml_are_structural(self) -> None:
        variants = (
            self._docx(document=b"<broken>"),
            self._docx(document=b"<!DOCTYPE x><x/>"),
            self._docx(document=b"<!ENTITY x 'secret'><x/>"),
            self._docx(relationships=b"<broken>"),
        )
        for content in variants:
            with self.subTest(), self.assertRaises(
                DocxSourcePreAnalysisStructureError,
            ) as raised:
                DocxSourcePreAnalysisProcessor().process(
                    source=self._source(content),
                )
            self.assertNotIn("secret", str(raised.exception))

    def test_combined_features_have_exact_stable_findings(self) -> None:
        body = (
            b"<w:p><w:t>   </w:t><m:oMath/><m:oMathPara/>"
            b"<w:tbl/><w:tbl/><w:drawing/><w:pict/>"
            b"<w:br w:type='page'/><w:sectPr/></w:p>"
        )
        result = DocxSourcePreAnalysisProcessor().process(
            source=self._source(self._docx(body)),
        ).result

        self.assertIsNone(result.page_count)
        self.assertEqual(
            tuple(finding.finding_code for finding in result.findings),
            (
                DOCX_NO_TEXT_CONTENT,
                DOCX_MATH_PRESENT,
                DOCX_TABLE_PRESENT,
                DOCX_DRAWING_PRESENT,
            ),
        )
        self.assertEqual(
            tuple(finding.message for finding in result.findings),
            (
                DOCX_NO_TEXT_CONTENT_MESSAGE,
                DOCX_MATH_PRESENT_MESSAGE,
                DOCX_TABLE_PRESENT_MESSAGE,
                DOCX_DRAWING_PRESENT_MESSAGE,
            ),
        )
        self.assertEqual(
            tuple(finding.severity for finding in result.findings),
            (
                SourcePreAnalysisFindingSeverity.WARNING,
                SourcePreAnalysisFindingSeverity.INFO,
                SourcePreAnalysisFindingSeverity.INFO,
                SourcePreAnalysisFindingSeverity.INFO,
            ),
        )
        self.assertTrue(all(f.page_number is None for f in result.findings))
        self.assertTrue(all(f.confidence is None for f in result.findings))

    def test_feature_variants_aliases_and_empty_document(self) -> None:
        variants = (
            (b"", (DOCX_NO_TEXT_CONTENT,)),
            (b"<m:oMath/>", (DOCX_NO_TEXT_CONTENT, DOCX_MATH_PRESENT)),
            (b"<w:tbl/>", (DOCX_NO_TEXT_CONTENT, DOCX_TABLE_PRESENT)),
            (b"<w:drawing/>", (DOCX_NO_TEXT_CONTENT, DOCX_DRAWING_PRESENT)),
            (b"<w:pict/>", (DOCX_NO_TEXT_CONTENT, DOCX_DRAWING_PRESENT)),
        )
        for body, expected in variants:
            with self.subTest(expected=expected):
                result = DocxSourcePreAnalysisProcessor().process(
                    source=self._source(self._docx(body)),
                ).result
                self.assertEqual(
                    tuple(f.finding_code for f in result.findings), expected,
                )

        aliased = (
            b'<x:document xmlns:x="http://schemas.openxmlformats.org/'
            b'wordprocessingml/2006/main" xmlns:eq="http://schemas.'
            b'openxmlformats.org/officeDocument/2006/math"><x:body>'
            b"<x:t> </x:t><eq:oMath/><x:tbl/><x:drawing/>"
            b"</x:body></x:document>"
        )
        result = DocxSourcePreAnalysisProcessor().process(
            source=self._source(self._docx(document=aliased)),
        ).result
        self.assertEqual(len(result.findings), 4)

    def test_optional_parts_are_not_inspected_or_extracted(self) -> None:
        optional = (
            ("word/header1.xml", b"<w:t>Header</w:t><w:tbl/>") ,
            ("word/footer1.xml", b"<w:drawing/>") ,
            ("word/footnotes.xml", b"<m:oMath/>") ,
        )
        content = self._docx(b"", extra_members=optional)
        with patch.object(zipfile.ZipFile, "extract") as extract, patch.object(
            zipfile.ZipFile, "extractall"
        ) as extractall:
            result = DocxSourcePreAnalysisProcessor().process(
                source=self._source(content),
            ).result
        self.assertEqual(
            tuple(f.finding_code for f in result.findings),
            (DOCX_NO_TEXT_CONTENT,),
        )
        extract.assert_not_called()
        extractall.assert_not_called()


if __name__ == "__main__":
    unittest.main()
