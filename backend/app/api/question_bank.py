from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.enums import RoleName
from app.database.session import get_db
from app.models.user import User
from app.schemas.question_bank import QuestionBankListQuery, QuestionBankPageRead
from app.services.question_bank_service import QuestionBankService


router = APIRouter(
    prefix="/question-bank",
    tags=["Question Bank"],
)


@router.get(
    "/questions",
    response_model=QuestionBankPageRead,
    status_code=status.HTTP_200_OK,
    summary="List Question Bank questions",
)
def list_questions(
    query: Annotated[QuestionBankListQuery, Query()],
    _current_user: Annotated[
        User,
        Depends(require_roles(RoleName.ADMIN)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> QuestionBankPageRead:
    """Return the filtered, paginated Admin Question Bank list."""

    return QuestionBankService(db).list_questions(query=query)
