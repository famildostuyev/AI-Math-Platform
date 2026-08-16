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
    FormulaBlockCreate,
    FormulaBlockRead,
    FormulaBlockUpdate,
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockRead,
    TextBlockUpdate,
)
from app.services.question_editor_service import (
    ContentBlockOrderConflictError,
    EditorBlockContentMissingError,
    EditorBlockNotFoundError,
    EditorBlockTypeMismatchError,
    PurposeNotFoundError,
    QuestionEditorService,
    QuestionTypeNotFoundError,
    RevisionNotFoundError,
    RevisionConflictError,
    RevisionNotEditableError,
    TopicNotFoundError,
)
from app.services.structured_text_service import (
    UnsupportedStructuredTextVersionError,
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


@router.post(
    "/revisions/{revision_id}/blocks/text",
    response_model=TextBlockRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a text block",
)
def create_text_block(
    revision_id: uuid.UUID,
    request: TextBlockCreate,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> TextBlockRead:
    """Append one structured-text block to an editable draft revision."""

    try:
        return QuestionEditorService(db).create_text_block(
            revision_id=revision_id,
            request=request,
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question revision was not found.",
        ) from exc
    except RevisionNotEditableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision is not editable.",
        ) from exc
    except RevisionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision was modified by another request.",
        ) from exc
    except ContentBlockOrderConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block order conflict.",
        ) from exc
    except UnsupportedStructuredTextVersionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Structured text format version is unsupported.",
        ) from exc


@router.post(
    "/revisions/{revision_id}/blocks/formula",
    response_model=FormulaBlockRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a formula block",
)
def create_formula_block(
    revision_id: uuid.UUID,
    request: FormulaBlockCreate,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> FormulaBlockRead:
    """Append one formula block to an editable draft revision."""

    try:
        return QuestionEditorService(db).create_formula_block(
            revision_id=revision_id,
            request=request,
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question revision was not found.",
        ) from exc
    except RevisionNotEditableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision is not editable.",
        ) from exc
    except RevisionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision was modified by another request.",
        ) from exc
    except ContentBlockOrderConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block order conflict.",
        ) from exc


@router.patch(
    "/revisions/{revision_id}/blocks/{block_id}/formula",
    response_model=FormulaBlockRead,
    status_code=status.HTTP_200_OK,
    summary="Update a formula block",
)
def update_formula_block(
    revision_id: uuid.UUID,
    block_id: uuid.UUID,
    request: FormulaBlockUpdate,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> FormulaBlockRead:
    """Replace one formula payload without changing its identity or order."""

    try:
        return QuestionEditorService(db).update_formula_block(
            revision_id=revision_id,
            block_id=block_id,
            request=request,
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question revision was not found.",
        ) from exc
    except RevisionNotEditableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision is not editable.",
        ) from exc
    except RevisionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision was modified by another request.",
        ) from exc
    except EditorBlockNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content block was not found.",
        ) from exc
    except EditorBlockTypeMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block type does not match the requested operation.",
        ) from exc
    except EditorBlockContentMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block payload is unavailable.",
        ) from exc


@router.patch(
    "/revisions/{revision_id}/blocks/{block_id}/text",
    response_model=TextBlockRead,
    status_code=status.HTTP_200_OK,
    summary="Update a text block",
)
def update_text_block(
    revision_id: uuid.UUID,
    block_id: uuid.UUID,
    request: TextBlockUpdate,
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> TextBlockRead:
    """Replace one text block payload without changing its identity or order."""

    try:
        return QuestionEditorService(db).update_text_block(
            revision_id=revision_id,
            block_id=block_id,
            request=request,
        )
    except RevisionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question revision was not found.",
        ) from exc
    except RevisionNotEditableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision is not editable.",
        ) from exc
    except RevisionConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question revision was modified by another request.",
        ) from exc
    except EditorBlockNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content block was not found.",
        ) from exc
    except EditorBlockTypeMismatchError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block type does not match the requested operation.",
        ) from exc
    except EditorBlockContentMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Content block payload is unavailable.",
        ) from exc
    except UnsupportedStructuredTextVersionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Structured text format version is unsupported.",
        ) from exc
