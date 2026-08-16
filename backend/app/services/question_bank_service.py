from __future__ import annotations

import math
import uuid

from sqlalchemy import Select, and_, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models.content_block import ContentBlock
from app.models.formula_block_content import FormulaBlockContent
from app.models.purpose import Purpose
from app.models.question_family import QuestionFamily
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.question_revision_purpose import QuestionRevisionPurpose
from app.models.question_type import QuestionType
from app.models.text_block_content import TextBlockContent
from app.models.topic import Topic
from app.schemas.question_bank import (
    QuestionBankItemRead,
    QuestionBankListQuery,
    QuestionBankPageRead,
    QuestionBankPrimaryTopicRead,
    QuestionBankQuestionTypeRead,
    QuestionBankSort,
)


_TEXT_PREVIEW_MAX_LENGTH = 240
_LIKE_ESCAPE = "\\"


def _literal_ilike_pattern(value: str) -> str:
    escaped = value.replace(_LIKE_ESCAPE, _LIKE_ESCAPE * 2)
    escaped = escaped.replace("%", f"{_LIKE_ESCAPE}%")
    escaped = escaped.replace("_", f"{_LIKE_ESCAPE}_")
    return f"%{escaped}%"


class QuestionBankService:
    """Read-only discovery service for the Admin Question Bank."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_questions(
        self,
        *,
        query: QuestionBankListQuery,
    ) -> QuestionBankPageRead:
        """List one latest saved revision for each eligible question form."""

        latest_revision = (
            select(
                QuestionRevision.question_form_id.label("question_form_id"),
                func.max(QuestionRevision.revision_number).label(
                    "revision_number"
                ),
            )
            .where(QuestionRevision.deleted_at.is_(None))
            .group_by(QuestionRevision.question_form_id)
            .subquery("latest_question_revision")
        )

        primary_topic = aliased(Topic, name="primary_topic")
        block_count = (
            select(func.count(ContentBlock.id))
            .where(
                ContentBlock.question_revision_id == QuestionRevision.id,
                ContentBlock.deleted_at.is_(None),
            )
            .correlate(QuestionRevision)
            .scalar_subquery()
        )
        text_preview = (
            select(
                func.left(
                    func.btrim(TextBlockContent.source_text),
                    _TEXT_PREVIEW_MAX_LENGTH,
                )
            )
            .join(
                ContentBlock,
                ContentBlock.id == TextBlockContent.content_block_id,
            )
            .where(
                ContentBlock.question_revision_id == QuestionRevision.id,
                ContentBlock.deleted_at.is_(None),
            )
            .order_by(ContentBlock.sort_order, ContentBlock.id)
            .limit(1)
            .correlate(QuestionRevision)
            .scalar_subquery()
        )

        columns = (
            QuestionFamily.id.label("question_family_id"),
            QuestionForm.id.label("question_form_id"),
            QuestionRevision.id.label("revision_id"),
            QuestionRevision.revision_number,
            QuestionRevision.status,
            QuestionRevision.is_current_approved,
            QuestionType.id.label("question_type_id"),
            QuestionType.name.label("question_type_name"),
            QuestionType.display_name.label("question_type_display_name"),
            QuestionRevision.difficulty,
            primary_topic.id.label("primary_topic_id"),
            primary_topic.name.label("primary_topic_name"),
            primary_topic.display_name.label("primary_topic_display_name"),
            block_count.label("block_count"),
            text_preview.label("text_preview"),
            QuestionRevision.updated_at,
        )
        statement = (
            select(*columns)
            .select_from(QuestionForm)
            .join(
                QuestionFamily,
                QuestionFamily.id == QuestionForm.question_family_id,
            )
            .join(
                latest_revision,
                latest_revision.c.question_form_id == QuestionForm.id,
            )
            .join(
                QuestionRevision,
                and_(
                    QuestionRevision.question_form_id == QuestionForm.id,
                    QuestionRevision.revision_number
                    == latest_revision.c.revision_number,
                    QuestionRevision.deleted_at.is_(None),
                ),
            )
            .join(
                QuestionType,
                QuestionType.id == QuestionForm.question_type_id,
            )
            .outerjoin(
                primary_topic,
                and_(
                    primary_topic.id == QuestionRevision.primary_topic_id,
                    primary_topic.is_active.is_(True),
                    primary_topic.deleted_at.is_(None),
                ),
            )
            .where(
                QuestionForm.is_active.is_(True),
                QuestionForm.deleted_at.is_(None),
                QuestionFamily.is_active.is_(True),
                QuestionFamily.deleted_at.is_(None),
            )
        )
        statement = self._apply_filters(statement, query=query)

        filtered = statement.with_only_columns(
            QuestionForm.id.label("question_form_id"),
            maintain_column_froms=True,
        ).order_by(None)
        count_statement = select(func.count()).select_from(
            filtered.subquery("filtered_question_forms")
        )
        total = self.db.scalar(count_statement) or 0

        if query.sort == QuestionBankSort.CREATED_DESC:
            statement = statement.order_by(
                QuestionRevision.created_at.desc(),
                QuestionRevision.id.desc(),
            )
        else:
            statement = statement.order_by(
                QuestionRevision.updated_at.desc(),
                QuestionRevision.id.desc(),
            )

        offset = (query.page - 1) * query.page_size
        rows = self.db.execute(
            statement.offset(offset).limit(query.page_size)
        ).mappings().all()
        items = [self._item_from_row(row) for row in rows]

        return QuestionBankPageRead(
            items=items,
            page=query.page,
            page_size=query.page_size,
            total=total,
            total_pages=math.ceil(total / query.page_size) if total else 0,
        )

    @staticmethod
    def _apply_filters(
        statement: Select[tuple[object, ...]],
        *,
        query: QuestionBankListQuery,
    ) -> Select[tuple[object, ...]]:
        if query.question_type_id is not None:
            statement = statement.where(
                QuestionForm.question_type_id == query.question_type_id
            )
        if query.status is not None:
            statement = statement.where(QuestionRevision.status == query.status)
        if query.difficulty is not None:
            statement = statement.where(
                QuestionRevision.difficulty == query.difficulty
            )
        if query.purpose_id is not None:
            purpose_match = exists(
                select(1)
                .select_from(QuestionRevisionPurpose)
                .join(
                    Purpose,
                    Purpose.id == QuestionRevisionPurpose.purpose_id,
                )
                .where(
                    QuestionRevisionPurpose.question_revision_id
                    == QuestionRevision.id,
                    QuestionRevisionPurpose.purpose_id == query.purpose_id,
                    QuestionRevisionPurpose.deleted_at.is_(None),
                    Purpose.is_active.is_(True),
                    Purpose.deleted_at.is_(None),
                )
            )
            statement = statement.where(purpose_match)
        if query.q is not None:
            pattern = _literal_ilike_pattern(query.q)
            text_match = exists(
                select(1)
                .select_from(ContentBlock)
                .join(
                    TextBlockContent,
                    TextBlockContent.content_block_id == ContentBlock.id,
                )
                .where(
                    ContentBlock.question_revision_id == QuestionRevision.id,
                    ContentBlock.deleted_at.is_(None),
                    TextBlockContent.source_text.ilike(
                        pattern,
                        escape=_LIKE_ESCAPE,
                    ),
                )
            )
            formula_match = exists(
                select(1)
                .select_from(ContentBlock)
                .join(
                    FormulaBlockContent,
                    FormulaBlockContent.content_block_id == ContentBlock.id,
                )
                .where(
                    ContentBlock.question_revision_id == QuestionRevision.id,
                    ContentBlock.deleted_at.is_(None),
                    FormulaBlockContent.source_latex.ilike(
                        pattern,
                        escape=_LIKE_ESCAPE,
                    ),
                )
            )
            search_conditions: list[object] = [text_match, formula_match]
            try:
                identifier = uuid.UUID(query.q)
            except ValueError:
                pass
            else:
                search_conditions.extend((
                    QuestionRevision.id == identifier,
                    QuestionForm.id == identifier,
                    QuestionFamily.id == identifier,
                ))
            statement = statement.where(or_(*search_conditions))
        return statement

    @staticmethod
    def _item_from_row(row: object) -> QuestionBankItemRead:
        topic = None
        if row.primary_topic_id is not None:
            topic = QuestionBankPrimaryTopicRead(
                id=row.primary_topic_id,
                name=row.primary_topic_name,
                display_name=row.primary_topic_display_name,
            )
        return QuestionBankItemRead(
            question_family_id=row.question_family_id,
            question_form_id=row.question_form_id,
            revision_id=row.revision_id,
            revision_number=row.revision_number,
            status=row.status,
            is_current_approved=row.is_current_approved,
            question_type=QuestionBankQuestionTypeRead(
                id=row.question_type_id,
                name=row.question_type_name,
                display_name=row.question_type_display_name,
            ),
            difficulty=row.difficulty,
            primary_topic=topic,
            block_count=row.block_count,
            text_preview=row.text_preview,
            updated_at=row.updated_at,
        )
