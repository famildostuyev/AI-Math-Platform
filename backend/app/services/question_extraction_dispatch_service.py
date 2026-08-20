from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import QuestionExtractionRunStatus
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.source_document import SourceDocument


MAX_PENDING_RUN_DISCOVERY_LIMIT = 100


class QuestionExtractionDispatchError(Exception):
    """Base exception for trusted question extraction dispatch failures."""


class QuestionExtractionDispatchValidationError(
    QuestionExtractionDispatchError
):
    """Raised when pending-run discovery input is invalid."""


class QuestionExtractionDispatchService:
    """Discover bounded pending extraction work without claiming or mutating it."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_pending_run_ids(
        self,
        *,
        limit: int,
    ) -> tuple[uuid.UUID, ...]:
        """Return active pending extraction run IDs in deterministic queue order."""

        if (
            type(limit) is not int
            or limit <= 0
            or limit > MAX_PENDING_RUN_DISCOVERY_LIMIT
        ):
            raise QuestionExtractionDispatchValidationError(
                "Pending run discovery limit must be an integer from 1 to 100."
            )

        run_ids = self.db.scalars(
            select(QuestionExtractionRun.id)
            .join(
                SourceDocument,
                SourceDocument.id
                == QuestionExtractionRun.source_document_id,
            )
            .where(
                QuestionExtractionRun.status
                == QuestionExtractionRunStatus.PENDING,
                QuestionExtractionRun.deleted_at.is_(None),
                SourceDocument.deleted_at.is_(None),
            )
            .order_by(
                QuestionExtractionRun.created_at.asc(),
                QuestionExtractionRun.run_number.asc(),
                QuestionExtractionRun.id.asc(),
            )
            .limit(limit)
        ).all()

        return tuple(run_ids)
