from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.question_type import QuestionType


CANONICAL_QUESTION_TYPES = (
    {
        "name": "multiple_choice",
        "display_name": "Multiple choice",
        "description": "Choose one answer.",
        "sort_order": 1,
        "is_active": True,
    },
)


def seed_question_types(db: Session) -> None:
    """Create or synchronize canonical question types without duplicates."""

    names = [item["name"] for item in CANONICAL_QUESTION_TYPES]
    existing = db.scalars(
        select(QuestionType).where(QuestionType.name.in_(names))
    ).all()
    by_name = {item.name: item for item in existing}

    for data in CANONICAL_QUESTION_TYPES:
        question_type = by_name.get(data["name"])
        if question_type is None:
            db.add(QuestionType(**data))
            continue

        question_type.display_name = data["display_name"]
        question_type.description = data["description"]
        question_type.sort_order = data["sort_order"]
        question_type.is_active = data["is_active"]
        question_type.deleted_at = None

    db.commit()
