from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import SourcePreAnalysisRunStatus
from app.models.source_document import SourceDocument
from app.models.source_pre_analysis_run import SourcePreAnalysisRun


MAX_PENDING_RUN_DISCOVERY_LIMIT = 100


class SourcePreAnalysisDispatchError(Exception):
    """Base exception for trusted pre-analysis dispatch failures."""


class SourcePreAnalysisDispatchValidationError(
    SourcePreAnalysisDispatchError
):
    """Raised when pending-run discovery input is invalid."""


class SourcePreAnalysisDispatchService:
    """Discover bounded pending work without claiming or mutating it."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_pending_run_ids(
        self,
        *,
        limit: int,
    ) -> tuple[uuid.UUID, ...]:
        """Return active pending run IDs in deterministic queue order."""

        if (
            type(limit) is not int
            or limit <= 0
            or limit > MAX_PENDING_RUN_DISCOVERY_LIMIT
        ):
            raise SourcePreAnalysisDispatchValidationError(
                "Pending run discovery limit must be an integer from 1 to 100."
            )

        run_ids = self.db.scalars(
            select(SourcePreAnalysisRun.id)
            .join(
                SourceDocument,
                SourceDocument.id == SourcePreAnalysisRun.source_document_id,
            )
            .where(
                SourcePreAnalysisRun.status
                == SourcePreAnalysisRunStatus.PENDING,
                SourcePreAnalysisRun.deleted_at.is_(None),
                SourceDocument.deleted_at.is_(None),
            )
            .order_by(
                SourcePreAnalysisRun.created_at.asc(),
                SourcePreAnalysisRun.run_number.asc(),
                SourcePreAnalysisRun.id.asc(),
            )
            .limit(limit)
        ).all()
        return tuple(run_ids)
