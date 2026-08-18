from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.models.source_pre_analysis_run import SourcePreAnalysisRun
from app.schemas.source_pre_analysis import (
    SourcePreAnalysisFindingRead,
    SourcePreAnalysisOverviewRead,
    SourcePreAnalysisRunRead,
    SourcePreAnalysisSuccessfulResultRead,
)
from app.services.source_pre_analysis_read_service import (
    SourcePreAnalysisFindingView,
    SourcePreAnalysisOverview,
    SourcePreAnalysisReadService,
    SourcePreAnalysisReadSourceNotFoundError,
    SourcePreAnalysisRunSummary,
    SourcePreAnalysisSuccessfulResultView,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisActiveRunExistsError,
    SourcePreAnalysisPersistenceConflictError,
    SourcePreAnalysisRequestedByUserNotFoundError,
    SourcePreAnalysisService,
    SourcePreAnalysisSourceDocumentNotFoundError,
    SourcePreAnalysisValidationError,
)


router = APIRouter(
    prefix="/sources",
    tags=["Sources"],
)


def _map_run(
    run: SourcePreAnalysisRunSummary | SourcePreAnalysisRun,
    *,
    source_document_id: uuid.UUID,
) -> SourcePreAnalysisRunRead:
    return SourcePreAnalysisRunRead(
        id=run.id,
        source_document_id=source_document_id,
        run_number=run.run_number,
        status=run.status,
        requested_by_user_id=run.requested_by_user_id,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_message=run.failure_message,
    )


def _map_finding(
    finding: SourcePreAnalysisFindingView,
) -> SourcePreAnalysisFindingRead:
    return SourcePreAnalysisFindingRead(
        id=finding.id,
        sequence_number=finding.sequence_number,
        finding_code=finding.finding_code,
        severity=finding.severity,
        confidence=finding.confidence,
        message=finding.message,
        source_document_page_id=finding.source_document_page_id,
        page_number=finding.page_number,
    )


def _map_successful_result(
    result: SourcePreAnalysisSuccessfulResultView,
    *,
    source_document_id: uuid.UUID,
) -> SourcePreAnalysisSuccessfulResultRead:
    return SourcePreAnalysisSuccessfulResultRead(
        run=_map_run(result.run, source_document_id=source_document_id),
        result_id=result.result_id,
        schema_version=result.schema_version,
        page_count=result.page_count,
        processor_name=result.processor_name,
        processor_version=result.processor_version,
        provider_name=result.provider_name,
        model_name=result.model_name,
        prompt_version=result.prompt_version,
        finding_count=result.finding_count,
        info_count=result.info_count,
        warning_count=result.warning_count,
        error_count=result.error_count,
        findings=[_map_finding(finding) for finding in result.findings],
    )


def _map_overview(
    overview: SourcePreAnalysisOverview,
) -> SourcePreAnalysisOverviewRead:
    return SourcePreAnalysisOverviewRead(
        source_document_id=overview.source_document_id,
        media_asset_id=overview.media_asset_id,
        question_source_id=overview.question_source_id,
        uploaded_by_user_id=overview.uploaded_by_user_id,
        latest_run=(
            _map_run(
                overview.latest_run,
                source_document_id=overview.source_document_id,
            )
            if overview.latest_run is not None
            else None
        ),
        latest_successful_result=(
            _map_successful_result(
                overview.latest_successful_result,
                source_document_id=overview.source_document_id,
            )
            if overview.latest_successful_result is not None
            else None
        ),
    )


@router.post(
    "/{source_document_id}/pre-analysis/runs",
    response_model=SourcePreAnalysisRunRead,
    status_code=status.HTTP_201_CREATED,
    summary="Request source pre-analysis",
)
def create_pre_analysis_run(
    source_document_id: uuid.UUID,
    current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> SourcePreAnalysisRunRead:
    """Create one pending run requested by the authenticated Admin."""

    try:
        run = SourcePreAnalysisService(db).create_run(
            source_document_id=source_document_id,
            requested_by_user_id=current_user.id,
        )
        return _map_run(run, source_document_id=source_document_id)
    except SourcePreAnalysisSourceDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source document was not found.",
        ) from exc
    except SourcePreAnalysisActiveRunExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Source document already has an active pre-analysis run.",
        ) from exc
    except SourcePreAnalysisPersistenceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Pre-analysis run could not be created due to a "
                "persistence conflict."
            ),
        ) from exc
    except SourcePreAnalysisValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Pre-analysis run request is invalid.",
        ) from exc
    except SourcePreAnalysisRequestedByUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Authenticated requesting user is unavailable.",
        ) from exc


@router.get(
    "/{source_document_id}/pre-analysis",
    response_model=SourcePreAnalysisOverviewRead,
    status_code=status.HTTP_200_OK,
    summary="Get source pre-analysis overview",
)
def get_pre_analysis_overview(
    source_document_id: uuid.UUID,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> SourcePreAnalysisOverviewRead:
    """Return the latest run and latest successful analysis for a source."""

    try:
        overview = SourcePreAnalysisReadService(db).get_overview(
            source_document_id=source_document_id,
        )
        return _map_overview(overview)
    except SourcePreAnalysisReadSourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source document was not found.",
        ) from exc
