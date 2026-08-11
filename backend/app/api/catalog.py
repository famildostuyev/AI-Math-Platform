from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.database.session import get_db
from app.models.grade import Grade
from app.schemas.catalog import GradeCatalogResponse


router = APIRouter(
    prefix="/catalog",
    tags=["Catalog"],
)


@router.get(
    "/grades",
    response_model=list[GradeCatalogResponse],
    status_code=status.HTTP_200_OK,
    summary="List active grades",
)
def list_grades(
    _current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> list[GradeCatalogResponse]:
    """Return active, non-deleted grades in deterministic catalog order."""

    grades = db.scalars(
        select(Grade)
        .where(
            Grade.is_active.is_(True),
            Grade.deleted_at.is_(None),
        )
        .order_by(
            Grade.sort_order,
            Grade.display_name,
            Grade.id,
        )
    ).all()

    return [
        GradeCatalogResponse.model_validate(grade)
        for grade in grades
    ]
