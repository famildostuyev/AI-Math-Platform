from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.user import User
from app.schemas.question_extraction import (
    QuestionCandidateRead,
    QuestionExtractionAnalysisRead,
    QuestionExtractionAnalysisResultRead,
    QuestionExtractionOverviewRead,
    QuestionExtractionRunRead,
    QuestionExtractionSuccessfulResultRead,
)
from app.services.question_extraction_read_service import (
    QuestionCandidateView,
    QuestionExtractionOverview,
    QuestionExtractionReadService,
    QuestionExtractionReadSourceNotFoundError,
    QuestionExtractionRunSummary,
    QuestionExtractionSuccessfulResultView,
)
from app.services.question_extraction_service import (
    QuestionExtractionActiveRunExistsError,
    QuestionExtractionPersistenceConflictError,
    QuestionExtractionRequestedByUserNotFoundError,
    QuestionExtractionService,
    QuestionExtractionSourceDocumentNotFoundError,
    QuestionExtractionValidationError,
)


router = APIRouter(
    prefix="/sources",
    tags=["Sources"],
)


def _map_run(
    run: QuestionExtractionRun | QuestionExtractionRunSummary,
    *,
    source_document_id: uuid.UUID | None = None,
) -> QuestionExtractionRunRead:
    return QuestionExtractionRunRead(
        id=run.id,
        source_document_id=(
            run.source_document_id
            if hasattr(run, "source_document_id")
            else source_document_id
        ),
        run_number=run.run_number,
        status=run.status,
        requested_by_user_id=run.requested_by_user_id,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_message=run.failure_message,
    )


def _map_candidate(candidate: QuestionCandidateView) -> QuestionCandidateRead:
    return QuestionCandidateRead(
        id=candidate.id,
        sequence_number=candidate.sequence_number,
        extracted_text=candidate.extracted_text,
        confidence=candidate.confidence,
        source_document_page_id=candidate.source_document_page_id,
        page_number=candidate.page_number,
    )


def _map_successful_result(
    result: QuestionExtractionSuccessfulResultView,
    *,
    source_document_id: uuid.UUID,
) -> QuestionExtractionSuccessfulResultRead:
    return QuestionExtractionSuccessfulResultRead(
        run=_map_run(
            result.run,
            source_document_id=source_document_id,
        ),
        candidate_count=result.candidate_count,
        candidates=[
            _map_candidate(candidate)
            for candidate in result.candidates
        ],
        analysis_result=(
            QuestionExtractionAnalysisResultRead(
                run_id=result.analysis_result.question_extraction_run_id,
                schema_version=result.analysis_result.schema_version,
                processor_name=result.analysis_result.processor_name,
                processor_version=result.analysis_result.processor_version,
                provider_name=result.analysis_result.provider_name,
                model_name=result.analysis_result.model_name,
                prompt_version=result.analysis_result.prompt_version,
                processing_version=result.analysis_result.processing_version,
                analysis=QuestionExtractionAnalysisRead.model_validate(
                    result.analysis_result.analysis_data
                ),
            )
            if result.analysis_result is not None
            else None
        ),
    )


def _map_overview(
    overview: QuestionExtractionOverview,
) -> QuestionExtractionOverviewRead:
    return QuestionExtractionOverviewRead(
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
    "/{source_document_id}/question-extraction/runs",
    response_model=QuestionExtractionRunRead,
    status_code=status.HTTP_201_CREATED,
    summary="Request question extraction",
)
def create_question_extraction_run(
    source_document_id: uuid.UUID,
    current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> QuestionExtractionRunRead:
    """Create one pending question extraction run requested by the Admin."""

    try:
        run = QuestionExtractionService(db).create_run(
            source_document_id=source_document_id,
            requested_by_user_id=current_user.id,
        )
        return _map_run(run)
    except QuestionExtractionSourceDocumentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source document was not found.",
        ) from exc
    except QuestionExtractionActiveRunExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Source document already has an active "
                "question extraction run."
            ),
        ) from exc
    except QuestionExtractionPersistenceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Question extraction run could not be created due to a "
                "persistence conflict."
            ),
        ) from exc
    except QuestionExtractionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question extraction run request is invalid.",
        ) from exc
    except QuestionExtractionRequestedByUserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Authenticated requesting user is unavailable.",
        ) from exc


@router.get(
    "/{source_document_id}/question-extraction",
    response_model=QuestionExtractionOverviewRead,
    status_code=status.HTTP_200_OK,
    summary="Get question extraction overview",
)
def get_question_extraction_overview(
    source_document_id: uuid.UUID,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> QuestionExtractionOverviewRead:
    """Return the latest question extraction state and candidates."""

    try:
        overview = QuestionExtractionReadService(db).get_overview(
            source_document_id=source_document_id,
        )
        return _map_overview(overview)
    except QuestionExtractionReadSourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source document was not found.",
        ) from exc
