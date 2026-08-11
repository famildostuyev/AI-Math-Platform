from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, aliased

from app.api.deps import CurrentUser
from app.database.session import get_db
from app.models.grade import Grade
from app.models.purpose import Purpose
from app.schemas.catalog import GradeCatalogResponse, PurposeCatalogResponse


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


@router.get(
    "/purposes",
    response_model=list[PurposeCatalogResponse],
    status_code=status.HTTP_200_OK,
    summary="List active purposes",
)
def list_purposes(
    _current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> list[PurposeCatalogResponse]:
    """Return a flat active Purpose catalog grouped by parent hierarchy."""

    parent = aliased(Purpose)
    purposes = db.scalars(
        select(Purpose)
        .outerjoin(parent, Purpose.parent_id == parent.id)
        .where(
            Purpose.is_active.is_(True),
            Purpose.deleted_at.is_(None),
        )
        .order_by(
            func.coalesce(parent.sort_order, Purpose.sort_order),
            func.coalesce(parent.display_name, Purpose.display_name),
            func.coalesce(parent.id, Purpose.id),
            case((Purpose.parent_id.is_(None), 0), else_=1),
            Purpose.sort_order,
            Purpose.display_name,
            Purpose.id,
        )
    ).all()

    return [
        PurposeCatalogResponse.model_validate(purpose)
        for purpose in purposes
    ]
