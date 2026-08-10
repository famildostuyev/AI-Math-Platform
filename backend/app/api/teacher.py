from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.models.user import User


router = APIRouter(
    prefix="/teacher",
    tags=["Teacher"],
)


@router.get(
    "/dashboard",
    status_code=status.HTTP_200_OK,
    summary="Get teacher dashboard",
)
def get_teacher_dashboard(
    current_user: Annotated[
        User,
        Depends(
            require_roles(
                RoleName.TEACHER,
                RoleName.ADMIN,
            )
        ),
    ],
) -> dict[str, str]:
    """
    Return a minimal teacher dashboard response.

    This endpoint currently exists to verify role-based access control.
    """

    return {
        "message": "Teacher dashboard access granted.",
        "user_id": str(current_user.id),
    }