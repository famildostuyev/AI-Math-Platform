from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.question_extraction_run import QuestionExtractionRun
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorResult,
    validate_processor_result,
)
from app.services.question_extraction_service import (
    QuestionExtractionCandidateInput,
)


class QuestionExtractionOutputServiceError(Exception):
    """Base exception for extraction output-mapping failures."""


class QuestionExtractionOutputValidationError(
    QuestionExtractionOutputServiceError
):
    """Raised when trusted output-mapping input is invalid."""


class QuestionExtractionOutputSourceNotFoundError(
    QuestionExtractionOutputServiceError
):
    """Raised when active extraction run or source metadata is unavailable."""


class QuestionExtractionOutputStructureError(
    QuestionExtractionOutputServiceError
):
    """Raised when persisted source/page structure is inconsistent."""


class QuestionExtractionOutputPageError(
    QuestionExtractionOutputServiceError
):
    """Raised when a processor candidate references an unavailable page."""


class QuestionExtractionOutputService:
    """Map normalized processor candidates onto existing durable source pages."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def prepare_finalization_inputs(
        self,
        *,
        run_id: uuid.UUID,
        processor_result: QuestionExtractionProcessorResult,
    ) -> tuple[QuestionExtractionCandidateInput, ...]:
        if type(run_id) is not uuid.UUID:
            raise QuestionExtractionOutputValidationError(
                "Question extraction run ID must be a UUID."
            )

        try:
            normalized = validate_processor_result(processor_result)
        except Exception as exc:
            raise QuestionExtractionOutputValidationError(
                "Processor result is invalid."
            ) from exc

        try:
            row = self.db.execute(
                select(
                    QuestionExtractionRun,
                    SourceDocument,
                )
                .join(
                    SourceDocument,
                    SourceDocument.id
                    == QuestionExtractionRun.source_document_id,
                )
                .where(
                    QuestionExtractionRun.id == run_id,
                    QuestionExtractionRun.deleted_at.is_(None),
                    SourceDocument.deleted_at.is_(None),
                )
            ).first()
        except SQLAlchemyError as exc:
            raise QuestionExtractionOutputSourceNotFoundError(
                "Active extraction source context could not be resolved."
            ) from exc

        if row is None:
            raise QuestionExtractionOutputSourceNotFoundError(
                "Active extraction source context was not found."
            )

        run, source_document = row

        if run.source_document_id != source_document.id:
            raise QuestionExtractionOutputStructureError(
                "Persisted extraction source ownership is inconsistent."
            )

        page_numbers = {
            candidate.page_number
            for candidate in normalized.candidates
            if candidate.page_number is not None
        }

        page_by_number: dict[int, uuid.UUID] = {}

        if page_numbers:
            try:
                pages = list(
                    self.db.scalars(
                        select(SourceDocumentPage)
                        .where(
                            SourceDocumentPage.source_document_id
                            == source_document.id,
                            SourceDocumentPage.page_number.in_(page_numbers),
                        )
                    ).all()
                )
            except SQLAlchemyError as exc:
                raise QuestionExtractionOutputSourceNotFoundError(
                    "Source document pages could not be resolved."
                ) from exc

            if any(
                page.deleted_at is not None
                for page in pages
            ):
                raise QuestionExtractionOutputStructureError(
                    "Soft-deleted source page history cannot be reused."
                )

            seen_page_numbers: set[int] = set()
            for page in pages:
                if page.page_number in seen_page_numbers:
                    raise QuestionExtractionOutputStructureError(
                        "Duplicate source page history is inconsistent."
                    )
                seen_page_numbers.add(page.page_number)

                if page.source_document_id != source_document.id:
                    raise QuestionExtractionOutputPageError(
                        "Referenced source page belongs to another document."
                    )

                page_by_number[page.page_number] = page.id

            if set(page_by_number) != page_numbers:
                raise QuestionExtractionOutputPageError(
                    "Referenced source page identity is unavailable."
                )

        mapped: list[QuestionExtractionCandidateInput] = []

        for candidate in normalized.candidates:
            source_document_page_id = None
            if candidate.page_number is not None:
                source_document_page_id = page_by_number.get(
                    candidate.page_number
                )
                if source_document_page_id is None:
                    raise QuestionExtractionOutputPageError(
                        "Referenced source page identity is unavailable."
                    )

            mapped.append(
                QuestionExtractionCandidateInput(
                    source_document_page_id=source_document_page_id,
                    extracted_text=candidate.extracted_text,
                    confidence=candidate.confidence,
                )
            )

        return tuple(mapped)
