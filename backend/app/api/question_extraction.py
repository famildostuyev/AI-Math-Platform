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
from app.schemas.question_extraction import QuestionExtractionRunRead
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


def _map_run(run: QuestionExtractionRun) -> QuestionExtractionRunRead:
    return QuestionExtractionRunRead(
        id=run.id,
        source_document_id=run.source_document_id,
        run_number=run.run_number,
        status=run.status,
        requested_by_user_id=run.requested_by_user_id,
        started_at=run.started_at,
        completed_at=run.completed_at,
        failure_message=run.failure_message,
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
