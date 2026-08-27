from __future__ import annotations

import json
import uuid

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.question_type import QuestionType
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision


ADMIN_AI_MAX_GROUNDED_QUESTION_TYPES = 100
ADMIN_AI_MAX_CATALOG_GROUNDING_BYTES = 32_000


class StrictPlannerGroundingModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AdminAIQuestionTypeGrounding(StrictPlannerGroundingModel):
    id: uuid.UUID
    name: str
    display_name: str


class AdminAIPlannerCatalogGrounding(StrictPlannerGroundingModel):
    question_types: tuple[AdminAIQuestionTypeGrounding, ...] = ()


class AdminAICurrentRevisionGrounding(StrictPlannerGroundingModel):
    revision_id: uuid.UUID
    question_type_id: uuid.UUID


class AdminAIPlannerCatalogGroundingError(Exception):
    pass


class AdminAIPlannerCatalogGroundingLimitError(AdminAIPlannerCatalogGroundingError):
    pass


class AdminAIPlannerCurrentRevisionGroundingError(AdminAIPlannerCatalogGroundingError):
    pass


class AdminAIPlannerCatalogService:
    """Projects bounded canonical catalog data for planning; no ORM escapes."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def build(self) -> AdminAIPlannerCatalogGrounding:
        rows = self._db.scalars(
            select(QuestionType)
            .where(QuestionType.is_active.is_(True), QuestionType.deleted_at.is_(None))
            .order_by(QuestionType.sort_order, QuestionType.name, QuestionType.id)
            .limit(ADMIN_AI_MAX_GROUNDED_QUESTION_TYPES + 1)
        ).all()
        if len(rows) > ADMIN_AI_MAX_GROUNDED_QUESTION_TYPES:
            raise AdminAIPlannerCatalogGroundingLimitError("Planner catalog entry limit was exceeded.")
        grounding = AdminAIPlannerCatalogGrounding(question_types=tuple(
            AdminAIQuestionTypeGrounding(
                id=row.id, name=row.name, display_name=row.display_name,
            )
            for row in rows
        ))
        serialized = json.dumps(
            grounding.model_dump(mode="json"), ensure_ascii=False,
            sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")
        if len(serialized) > ADMIN_AI_MAX_CATALOG_GROUNDING_BYTES:
            raise AdminAIPlannerCatalogGroundingLimitError("Planner catalog size limit was exceeded.")
        return grounding


class AdminAIPlannerCurrentRevisionService:
    """Resolves only active revision/type identities; no stored content is projected."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def resolve(self, *, revision_id: uuid.UUID) -> AdminAICurrentRevisionGrounding:
        row = self._db.execute(
            select(QuestionRevision.id, QuestionForm.question_type_id)
            .join(QuestionForm, QuestionForm.id == QuestionRevision.question_form_id)
            .join(QuestionType, QuestionType.id == QuestionForm.question_type_id)
            .where(
                QuestionRevision.id == revision_id,
                QuestionRevision.deleted_at.is_(None),
                QuestionForm.deleted_at.is_(None),
                QuestionType.deleted_at.is_(None),
                QuestionType.is_active.is_(True),
            )
        ).one_or_none()
        if row is None:
            raise AdminAIPlannerCurrentRevisionGroundingError(
                "Active current revision grounding is unavailable."
            )
        return AdminAICurrentRevisionGrounding(
            revision_id=row[0], question_type_id=row[1],
        )
