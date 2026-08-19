from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from sqlalchemy import case, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import SourcePreAnalysisRunStatus
from app.core.security import utc_now
from app.models.source_pre_analysis_result import SourcePreAnalysisResult
from app.models.source_pre_analysis_run import SourcePreAnalysisRun


MAX_RECOVERY_BATCH_SIZE = 100
STALE_RUN_FAILURE_MESSAGE = (
    "Pre-analysis execution was interrupted before completion."
)


class SourcePreAnalysisRecoveryError(Exception):
    """Base exception for trusted stale-run recovery failures."""


class SourcePreAnalysisRecoveryValidationError(
    SourcePreAnalysisRecoveryError
):
    """Raised when stale-run recovery input is invalid."""


class SourcePreAnalysisRecoveryPersistenceConflictError(
    SourcePreAnalysisRecoveryError
):
    """Raised when a recovery transition conflicts during persistence."""


class SourcePreAnalysisRecoveryOutcome(str, Enum):
    RECOVERED = "recovered"
    SKIPPED = "skipped"
    RECONCILIATION_REQUIRED = "reconciliation_required"


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisRecoveryResult:
    run_id: uuid.UUID
    outcome: SourcePreAnalysisRecoveryOutcome


class SourcePreAnalysisRecoveryService:
    """Discover and recover stale execution leases under row locking."""

    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _validate_stale_before(stale_before: datetime) -> None:
        if (
            type(stale_before) is not datetime
            or stale_before.tzinfo is None
            or stale_before.utcoffset() is None
        ):
            raise SourcePreAnalysisRecoveryValidationError(
                "Stale cutoff must be a timezone-aware datetime."
            )

    @staticmethod
    def _validate_run_id(run_id: uuid.UUID) -> None:
        if type(run_id) is not uuid.UUID:
            raise SourcePreAnalysisRecoveryValidationError(
                "Source pre-analysis run ID must be a UUID."
            )

    def list_recovery_candidate_ids(
        self,
        *,
        stale_before: datetime,
        limit: int,
    ) -> tuple[uuid.UUID, ...]:
        self._validate_stale_before(stale_before)
        if (
            type(limit) is not int
            or limit <= 0
            or limit > MAX_RECOVERY_BATCH_SIZE
        ):
            raise SourcePreAnalysisRecoveryValidationError(
                "Recovery candidate limit must be an integer from 1 to 100."
            )

        inconsistent = or_(
            SourcePreAnalysisRun.execution_lease_id.is_(None),
            SourcePreAnalysisRun.last_heartbeat_at.is_(None),
        )
        stale = (
            SourcePreAnalysisRun.execution_lease_id.is_not(None)
            & SourcePreAnalysisRun.last_heartbeat_at.is_not(None)
            & (SourcePreAnalysisRun.last_heartbeat_at < stale_before)
        )
        run_ids = self.db.scalars(
            select(SourcePreAnalysisRun.id)
            .where(
                SourcePreAnalysisRun.status
                == SourcePreAnalysisRunStatus.RUNNING,
                SourcePreAnalysisRun.deleted_at.is_(None),
                or_(inconsistent, stale),
            )
            .order_by(
                case(
                    (SourcePreAnalysisRun.last_heartbeat_at.is_(None), 0),
                    else_=1,
                ).asc(),
                SourcePreAnalysisRun.last_heartbeat_at.asc(),
                SourcePreAnalysisRun.id.asc(),
            )
            .limit(limit)
        ).all()
        return tuple(run_ids)

    def recover_stale_run(
        self,
        *,
        run_id: uuid.UUID,
        stale_before: datetime,
    ) -> SourcePreAnalysisRecoveryResult:
        self._validate_run_id(run_id)
        self._validate_stale_before(stale_before)

        try:
            run = self.db.scalar(
                select(SourcePreAnalysisRun)
                .where(
                    SourcePreAnalysisRun.id == run_id,
                    SourcePreAnalysisRun.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if run is None or run.status != SourcePreAnalysisRunStatus.RUNNING:
                outcome = SourcePreAnalysisRecoveryOutcome.SKIPPED
            elif (
                run.execution_lease_id is None
                or run.last_heartbeat_at is None
            ):
                outcome = (
                    SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED
                )
            elif run.last_heartbeat_at >= stale_before:
                outcome = SourcePreAnalysisRecoveryOutcome.SKIPPED
            else:
                existing_result_id = self.db.scalar(
                    select(SourcePreAnalysisResult.id)
                    .where(
                        SourcePreAnalysisResult.source_pre_analysis_run_id
                        == run.id,
                    )
                    .limit(1)
                )
                if existing_result_id is not None:
                    outcome = (
                        SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED
                    )
                else:
                    run.status = SourcePreAnalysisRunStatus.FAILED
                    run.completed_at = utc_now()
                    run.failure_message = STALE_RUN_FAILURE_MESSAGE
                    run.execution_lease_id = None
                    run.last_heartbeat_at = None
                    outcome = SourcePreAnalysisRecoveryOutcome.RECOVERED

            self.db.commit()
            return SourcePreAnalysisRecoveryResult(
                run_id=run_id,
                outcome=outcome,
            )
        except IntegrityError as exc:
            self.db.rollback()
            raise SourcePreAnalysisRecoveryPersistenceConflictError(
                "Stale pre-analysis recovery could not be persisted."
            ) from exc
        except Exception:
            self.db.rollback()
            raise
