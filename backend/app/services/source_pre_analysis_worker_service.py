from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import utc_now
from app.database.session import SessionLocal
from app.services.source_pre_analysis_dispatch_service import (
    SourcePreAnalysisDispatchService,
)
from app.services.source_pre_analysis_execution_service import (
    SourcePreAnalysisExecutionError,
    SourcePreAnalysisExecutionReconciliationRequiredError,
    SourcePreAnalysisExecutionService,
    SourcePreAnalysisExecutionStartError,
)
from app.services.source_pre_analysis_processor_registry import (
    build_source_pre_analysis_processor_selector,
)
from app.services.source_pre_analysis_recovery_service import (
    SourcePreAnalysisRecoveryOutcome,
    SourcePreAnalysisRecoveryService,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisInvalidRunStateError,
    SourcePreAnalysisLeaseMismatchError,
    SourcePreAnalysisService,
)


logger = logging.getLogger(__name__)
SessionFactory = Callable[[], Session]


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisWorkerSummary:
    discovered: int
    succeeded: int
    failed: int
    claim_skipped: int
    reconciliation_required: int
    stale_recovered: int

    def __post_init__(self) -> None:
        for value in (
            self.discovered,
            self.succeeded,
            self.failed,
            self.claim_skipped,
            self.reconciliation_required,
            self.stale_recovered,
        ):
            if type(value) is not int or value < 0:
                raise ValueError("Worker summary values must be non-negative integers.")


class _HeartbeatWatchdog:
    def __init__(
        self,
        *,
        session_factory: SessionFactory,
        interval_seconds: int,
    ) -> None:
        self._session_factory = session_factory
        self._interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self, *, run_id: uuid.UUID, execution_lease_id: uuid.UUID) -> None:
        if self._thread is not None:
            raise RuntimeError("Heartbeat watchdog has already been started.")
        self._thread = threading.Thread(
            target=self._run,
            kwargs={
                "run_id": run_id,
                "execution_lease_id": execution_lease_id,
            },
            name="source-pre-analysis-heartbeat",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join()

    def _run(
        self,
        *,
        run_id: uuid.UUID,
        execution_lease_id: uuid.UUID,
    ) -> None:
        while not self._stop_event.wait(self._interval_seconds):
            db = self._session_factory()
            try:
                SourcePreAnalysisService(db).heartbeat_run(
                    run_id=run_id,
                    execution_lease_id=execution_lease_id,
                )
            except (
                SourcePreAnalysisInvalidRunStateError,
                SourcePreAnalysisLeaseMismatchError,
            ):
                db.rollback()
                logger.info("Pre-analysis heartbeat stopped for run %s.", run_id)
                return
            except Exception:
                db.rollback()
                logger.warning("Pre-analysis heartbeat failed for run %s.", run_id)
                return
            finally:
                db.close()


class _WatchdogLifecycleService:
    def __init__(
        self,
        db: Session,
        *,
        watchdog: _HeartbeatWatchdog,
    ) -> None:
        self._service = SourcePreAnalysisService(db)
        self._watchdog = watchdog

    def start_run(self, *, run_id: uuid.UUID):
        claim = self._service.start_run(run_id=run_id)
        self._watchdog.start(
            run_id=claim.run_id,
            execution_lease_id=claim.execution_lease_id,
        )
        return claim

    def finalize_success(self, **kwargs):
        return self._service.finalize_success(**kwargs)

    def mark_failed(self, **kwargs):
        return self._service.mark_failed(**kwargs)


class SourcePreAnalysisWorkerService:
    """Recover and execute one bounded batch of pre-analysis work."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory = SessionLocal,
        worker_batch_size: int = settings.SOURCE_PRE_ANALYSIS_WORKER_BATCH_SIZE,
        recovery_batch_size: int = settings.SOURCE_PRE_ANALYSIS_RECOVERY_BATCH_SIZE,
        lease_seconds: int = settings.SOURCE_PRE_ANALYSIS_LEASE_SECONDS,
        heartbeat_seconds: int = settings.SOURCE_PRE_ANALYSIS_HEARTBEAT_SECONDS,
        selector_factory=build_source_pre_analysis_processor_selector,
        watchdog_factory=_HeartbeatWatchdog,
    ) -> None:
        self._session_factory = session_factory
        self._worker_batch_size = worker_batch_size
        self._recovery_batch_size = recovery_batch_size
        self._lease_seconds = lease_seconds
        self._heartbeat_seconds = heartbeat_seconds
        self._selector_factory = selector_factory
        self._watchdog_factory = watchdog_factory

    def run_once(self) -> SourcePreAnalysisWorkerSummary:
        stale_recovered, reconciliation_required = self._recover_stale_runs()
        run_ids = self._discover_pending_runs()
        succeeded = failed = claim_skipped = 0

        for run_id in run_ids:
            db = self._session_factory()
            watchdog = self._watchdog_factory(
                session_factory=self._session_factory,
                interval_seconds=self._heartbeat_seconds,
            )
            try:
                lifecycle = _WatchdogLifecycleService(db, watchdog=watchdog)
                SourcePreAnalysisExecutionService(
                    db,
                    processor_selector=self._selector_factory(),
                    lifecycle_service=lifecycle,
                ).execute_run(run_id=run_id)
            except SourcePreAnalysisExecutionStartError:
                db.rollback()
                claim_skipped += 1
                logger.info("Pre-analysis claim skipped for run %s.", run_id)
            except SourcePreAnalysisExecutionReconciliationRequiredError:
                db.rollback()
                reconciliation_required += 1
                logger.warning(
                    "Pre-analysis reconciliation required for run %s.", run_id
                )
            except SourcePreAnalysisExecutionError:
                db.rollback()
                failed += 1
                logger.warning("Pre-analysis execution failed for run %s.", run_id)
            else:
                succeeded += 1
                logger.info("Pre-analysis execution succeeded for run %s.", run_id)
            finally:
                watchdog.stop()
                db.close()

        summary = SourcePreAnalysisWorkerSummary(
            discovered=len(run_ids),
            succeeded=succeeded,
            failed=failed,
            claim_skipped=claim_skipped,
            reconciliation_required=reconciliation_required,
            stale_recovered=stale_recovered,
        )
        logger.info("Source pre-analysis worker summary: %s", summary)
        return summary

    def _recover_stale_runs(self) -> tuple[int, int]:
        stale_before = utc_now() - timedelta(seconds=self._lease_seconds)
        db = self._session_factory()
        recovered = reconciliation_required = 0
        try:
            service = SourcePreAnalysisRecoveryService(db)
            run_ids = service.list_recovery_candidate_ids(
                stale_before=stale_before,
                limit=self._recovery_batch_size,
            )
            for run_id in run_ids:
                try:
                    result = service.recover_stale_run(
                        run_id=run_id,
                        stale_before=stale_before,
                    )
                except Exception:
                    db.rollback()
                    logger.warning("Pre-analysis recovery failed for run %s.", run_id)
                    continue
                if result.outcome == SourcePreAnalysisRecoveryOutcome.RECOVERED:
                    recovered += 1
                elif (
                    result.outcome
                    == SourcePreAnalysisRecoveryOutcome.RECONCILIATION_REQUIRED
                ):
                    reconciliation_required += 1
        finally:
            db.close()
        return recovered, reconciliation_required

    def _discover_pending_runs(self) -> tuple[uuid.UUID, ...]:
        db = self._session_factory()
        try:
            return SourcePreAnalysisDispatchService(db).list_pending_run_ids(
                limit=self._worker_batch_size,
            )
        finally:
            db.close()
