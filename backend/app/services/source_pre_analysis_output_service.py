from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.media_asset import MediaAsset
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage
from app.models.source_pre_analysis_run import SourcePreAnalysisRun
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorResult,
    validate_processor_result,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisFindingInput,
    SourcePreAnalysisResultInput,
)


PDF_MIME_TYPE = "application/pdf"
DOCX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document"
)
IMAGE_MIME_TYPES = frozenset(("image/png", "image/jpeg", "image/webp"))


class SourcePreAnalysisOutputServiceError(Exception):
    """Base exception for processor-output preparation failures."""


class SourcePreAnalysisOutputValidationError(
    SourcePreAnalysisOutputServiceError
):
    """Raised when trusted output-preparation input is invalid."""


class SourcePreAnalysisOutputSourceNotFoundError(
    SourcePreAnalysisOutputServiceError
):
    """Raised when active run, document, or media metadata is unavailable."""


class SourcePreAnalysisOutputUnsupportedMimeError(
    SourcePreAnalysisOutputServiceError
):
    """Raised when persisted source MIME has no page policy."""


class SourcePreAnalysisPageCountError(SourcePreAnalysisOutputServiceError):
    """Raised when page count violates source-family semantics."""


class SourcePreAnalysisFindingPageError(SourcePreAnalysisOutputServiceError):
    """Raised when a finding references an invalid logical page."""


class SourcePreAnalysisPageStructureError(SourcePreAnalysisOutputServiceError):
    """Raised when durable page history is inconsistent."""


class SourcePreAnalysisPagePersistenceConflictError(
    SourcePreAnalysisOutputServiceError
):
    """Raised when page materialization encounters an integrity conflict."""


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisPreparedOutput:
    result: SourcePreAnalysisResultInput
    findings: tuple[SourcePreAnalysisFindingInput, ...]


class SourcePreAnalysisOutputService:
    """Materialize durable pages and map normalized processor output."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def prepare_finalization_inputs(
        self,
        *,
        run_id: uuid.UUID,
        processor_result: SourcePreAnalysisProcessorResult,
    ) -> SourcePreAnalysisPreparedOutput:
        try:
            if not isinstance(run_id, uuid.UUID):
                raise SourcePreAnalysisOutputValidationError(
                    "Source pre-analysis run ID must be a UUID."
                )
            normalized = validate_processor_result(processor_result)
            run, source_document, media_asset = self._get_source_context_for_update(
                run_id=run_id,
            )
            if (
                run.source_document_id != source_document.id
                or source_document.media_asset_id != media_asset.id
            ):
                raise SourcePreAnalysisPageStructureError(
                    "Persisted source ownership is inconsistent."
                )

            mime_type = media_asset.mime_type
            self._validate_page_semantics(
                mime_type=mime_type,
                processor_result=normalized,
            )
            page_by_number = self._reconcile_pages(
                source_document=source_document,
                mime_type=mime_type,
                page_count=normalized.page_count,
            )
            findings = self._map_findings(
                processor_result=normalized,
                page_by_number=page_by_number,
            )
            prepared = SourcePreAnalysisPreparedOutput(
                result=SourcePreAnalysisResultInput(
                    schema_version=normalized.schema_version,
                    page_count=normalized.page_count,
                ),
                findings=findings,
            )
            self.db.commit()
            return prepared
        except IntegrityError as exc:
            self.db.rollback()
            raise SourcePreAnalysisPagePersistenceConflictError(
                "Source document pages could not be persisted."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def _get_source_context_for_update(
        self,
        *,
        run_id: uuid.UUID,
    ) -> tuple[SourcePreAnalysisRun, SourceDocument, MediaAsset]:
        row = self.db.execute(
            select(SourcePreAnalysisRun, SourceDocument, MediaAsset)
            .join(
                SourceDocument,
                SourceDocument.id == SourcePreAnalysisRun.source_document_id,
            )
            .join(
                MediaAsset,
                MediaAsset.id == SourceDocument.media_asset_id,
            )
            .where(
                SourcePreAnalysisRun.id == run_id,
                SourcePreAnalysisRun.deleted_at.is_(None),
                SourceDocument.deleted_at.is_(None),
                MediaAsset.deleted_at.is_(None),
            )
            .with_for_update(of=SourceDocument)
        ).first()
        if row is None:
            raise SourcePreAnalysisOutputSourceNotFoundError(
                "Active source context was not found."
            )
        return row

    @staticmethod
    def _validate_page_semantics(
        *,
        mime_type: str,
        processor_result: SourcePreAnalysisProcessorResult,
    ) -> None:
        page_count = processor_result.page_count
        if mime_type == PDF_MIME_TYPE:
            if page_count is None or page_count <= 0:
                raise SourcePreAnalysisPageCountError(
                    "PDF page count must be positive."
                )
            maximum_page = page_count
        elif mime_type in IMAGE_MIME_TYPES:
            if page_count != 1:
                raise SourcePreAnalysisPageCountError(
                    "Image page count must equal one."
                )
            maximum_page = 1
        elif mime_type == DOCX_MIME_TYPE:
            if page_count is not None:
                raise SourcePreAnalysisPageCountError(
                    "DOCX page count must be null."
                )
            maximum_page = None
        else:
            raise SourcePreAnalysisOutputUnsupportedMimeError(
                "Persisted source MIME type is unsupported."
            )

        for finding in processor_result.findings:
            if finding.page_number is None:
                continue
            if maximum_page is None or finding.page_number > maximum_page:
                raise SourcePreAnalysisFindingPageError(
                    "Finding page reference is invalid for the source."
                )

    def _reconcile_pages(
        self,
        *,
        source_document: SourceDocument,
        mime_type: str,
        page_count: int | None,
    ) -> dict[int, uuid.UUID]:
        pages = list(
            self.db.scalars(
                select(SourceDocumentPage)
                .where(
                    SourceDocumentPage.source_document_id
                    == source_document.id,
                )
                .order_by(SourceDocumentPage.page_number.asc())
                .with_for_update()
            ).all()
        )
        if any(page.deleted_at is not None for page in pages):
            raise SourcePreAnalysisPageStructureError(
                "Soft-deleted page history cannot be reused."
            )

        page_numbers = [page.page_number for page in pages]
        if (
            any(
                not isinstance(number, int)
                or isinstance(number, bool)
                or number <= 0
                for number in page_numbers
            )
            or len(set(page_numbers)) != len(page_numbers)
        ):
            raise SourcePreAnalysisPageStructureError(
                "Persisted page numbering is inconsistent."
            )

        if mime_type == DOCX_MIME_TYPE:
            if pages:
                raise SourcePreAnalysisPageStructureError(
                    "DOCX source cannot own materialized pages."
                )
            return {}

        if page_count is None:
            raise SourcePreAnalysisPageCountError(
                "Materialized source requires a page count."
            )
        expected_prefix = list(range(1, len(pages) + 1))
        if page_numbers != expected_prefix or len(pages) > page_count:
            raise SourcePreAnalysisPageStructureError(
                "Persisted page range is inconsistent."
            )

        new_pages: list[SourceDocumentPage] = []
        for page_number in range(len(pages) + 1, page_count + 1):
            page = SourceDocumentPage(
                source_document_id=source_document.id,
                page_number=page_number,
            )
            self.db.add(page)
            new_pages.append(page)
        if new_pages:
            self.db.flush()

        all_pages = (*pages, *new_pages)
        return {page.page_number: page.id for page in all_pages}

    @staticmethod
    def _map_findings(
        *,
        processor_result: SourcePreAnalysisProcessorResult,
        page_by_number: dict[int, uuid.UUID],
    ) -> tuple[SourcePreAnalysisFindingInput, ...]:
        mapped: list[SourcePreAnalysisFindingInput] = []
        for finding in processor_result.findings:
            page_id = None
            if finding.page_number is not None:
                page_id = page_by_number.get(finding.page_number)
                if page_id is None:
                    raise SourcePreAnalysisFindingPageError(
                        "Finding page identity is unavailable."
                    )
            mapped.append(
                SourcePreAnalysisFindingInput(
                    source_document_page_id=page_id,
                    finding_code=finding.finding_code,
                    severity=finding.severity,
                    confidence=finding.confidence,
                    message=finding.message,
                )
            )
        return tuple(mapped)
