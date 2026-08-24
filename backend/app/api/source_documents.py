from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.source_document import SourceDocumentRead
from app.services.source_binary_service import (
    EmptySourceBinaryError,
    InvalidSourceBinaryError,
    SourceBinaryCleanupError,
    SourceBinaryImageDimensionsError,
    SourceBinaryStorageError,
    SourceBinaryTooLargeError,
    UnsafeSourceBinaryError,
    UnsupportedSourceBinaryError,
)
from app.services.source_document_read_service import SourceDocumentReadService
from app.services.source_ingestion_service import (
    SourceIngestionCompensationError,
    SourceIngestionPersistenceConflictError,
    SourceIngestionQuestionSourceNotFoundError,
    SourceIngestionService,
    SourceIngestionUploaderNotFoundError,
    SourceIngestionValidationError,
)


router = APIRouter(
    prefix="/sources",
    tags=["Sources"],
)


@router.get(
    "",
    response_model=list[SourceDocumentRead],
    status_code=status.HTTP_200_OK,
    summary="List source documents",
)
def list_source_documents(
    current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[SourceDocumentRead]:
    """Return active source documents for Admin source selection."""

    del current_user

    return list(SourceDocumentReadService(db).list_documents())


@router.post(
    "",
    response_model=SourceDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and register a source document",
)
def create_source_document(
    current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    question_source_id: Annotated[uuid.UUID | None, Form()] = None,
) -> SourceDocumentRead:
    """Atomically ingest one Admin-supplied immutable source binary."""

    try:
        return SourceIngestionService(db).create_source_document(
            upload=file.file,
            original_filename=file.filename,
            submitted_mime_type=file.content_type,
            question_source_id=question_source_id,
            uploaded_by_user_id=current_user.id,
        )
    except EmptySourceBinaryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded source file is empty.",
        ) from exc
    except SourceBinaryTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Uploaded source file exceeds the allowed size.",
        ) from exc
    except UnsupportedSourceBinaryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded source file type is unsupported.",
        ) from exc
    except InvalidSourceBinaryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded source file is invalid.",
        ) from exc
    except UnsafeSourceBinaryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded source file cannot be processed safely.",
        ) from exc
    except SourceBinaryImageDimensionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded image dimensions exceed the allowed limit.",
        ) from exc
    except SourceBinaryStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Source storage is temporarily unavailable.",
        ) from exc
    except SourceBinaryCleanupError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Source storage cleanup requires attention.",
        ) from exc
    except SourceIngestionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Source document request is invalid.",
        ) from exc
    except SourceIngestionQuestionSourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question source is unavailable.",
        ) from exc
    except SourceIngestionUploaderNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Authenticated uploading user is unavailable.",
        ) from exc
    except SourceIngestionPersistenceConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Source document could not be registered due to a "
                "persistence conflict."
            ),
        ) from exc
    except SourceIngestionCompensationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Source document registration failed and storage cleanup "
                "requires attention."
            ),
        ) from exc