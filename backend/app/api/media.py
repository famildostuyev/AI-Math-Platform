from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.media_asset import MediaAssetRead
from app.services.media_asset_service import (
    EmptyImageError,
    ImageDimensionsError,
    ImageTooLargeError,
    InvalidImageError,
    MediaAssetService,
)
from app.storage.media_storage import LocalMediaStorage


router = APIRouter(
    prefix="/media",
    tags=["Media"],
)


def get_media_asset_service(
    db: Annotated[Session, Depends(get_db)],
) -> MediaAssetService:
    storage = LocalMediaStorage(settings.MEDIA_ROOT)
    return MediaAssetService(
        db,
        storage=storage,
        max_image_bytes=settings.MEDIA_MAX_IMAGE_BYTES,
        max_image_pixels=settings.MEDIA_MAX_IMAGE_PIXELS,
    )


@router.post(
    "/assets/images",
    response_model=MediaAssetRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an image asset",
)
def upload_image_asset(
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    service: Annotated[
        MediaAssetService,
        Depends(get_media_asset_service),
    ],
    file: Annotated[UploadFile, File(...)],
) -> MediaAssetRead:
    """Ingest one Admin-supplied image through the media service."""

    try:
        return service.create_image_asset(
            upload=file.file,
            original_filename=file.filename,
            submitted_mime_type=file.content_type,
        )
    except EmptyImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded image is empty.",
        ) from exc
    except ImageTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Uploaded image exceeds the allowed size.",
        ) from exc
    except InvalidImageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded file is not a valid supported image.",
        ) from exc
    except ImageDimensionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Image dimensions exceed the allowed limit.",
        ) from exc
    finally:
        file.file.close()
