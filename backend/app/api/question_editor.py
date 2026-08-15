from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.question_editor import (
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
)
from app.services.question_editor_service import (
    PurposeNotFoundError,
    QuestionEditorService,
    QuestionTypeNotFoundError,
    RevisionNotFoundError,
    TopicNotFoundError,
)


router = APIRouter(
    prefix="/question-editor",
    tags=["Question Editor"],
)


@router.post(
    "/drafts",
    response_model=QuestionDraftRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a question draft",
)
def create_question_draft(
    request: QuestionDraftCreate,
    current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> QuestionDraftRead:
    """Create an authored draft for the authenticated Admin."""

    try:
        return QuestionEditorService(db).create_draft(
            draft=request,
            actor_id=current_user.id,
        )
    except QuestionTypeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question type is unavailable.",
        ) from exc
    except TopicNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Topic is unavailable.",
        ) from exc
    except PurposeNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Purpose is unavailable.",
        ) from exc


@router.get(
    "/revisions/{revision_id}",
    response_model=QuestionRevisionEditorRead,
    status_code=status.HTTP_200_OK,
    summary="Get a question revision for editing",
)
def get_question_revision(
    revision_id: uuid.UUID,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> QuestionRevisionEditorRead:
    """Return one revision in its Admin editor representation."""

    try:
        return QuestionEditorService(db).get_revision_for_editor(
            revision_id=revision_id,
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question revision was not found.",
        ) from exc
