from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import AnswerPolicy, QuestionRevisionStatus
from app.models.accepted_answer import AcceptedAnswer
from app.models.answer_option import AnswerOption
from app.models.question_family import QuestionFamily
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.question_type import QuestionType
from app.schemas.question_answer import (
    AcceptedAnswerCreate,
    AcceptedAnswerRead,
    AcceptedAnswerUpdate,
    AnswerOptionCreate,
    AnswerOptionRead,
    AnswerOptionUpdate,
    AnswerOrderRequest,
    RevisionAnswersRead,
    SetCorrectOptionsRequest,
)
from app.services.structured_text_service import (
    normalize_text_content,
    prepare_structured_text_write,
)


class QuestionAnswerServiceError(Exception):
    pass


class AnswerRevisionNotFoundError(QuestionAnswerServiceError):
    pass


class AnswerRevisionNotEditableError(QuestionAnswerServiceError):
    pass


class AnswerRevisionConflictError(QuestionAnswerServiceError):
    pass


class AnswerRecordNotFoundError(QuestionAnswerServiceError):
    pass


class AnswerOrderSetMismatchError(QuestionAnswerServiceError):
    pass


class AnswerIntegrityConflictError(QuestionAnswerServiceError):
    pass


class CorrectOptionDeleteError(QuestionAnswerServiceError):
    pass


class AnswerPolicyService:
    """Derive only policies explicitly represented by the current catalog."""

    @staticmethod
    def for_question_type_name(question_type_name: str) -> AnswerPolicy:
        if question_type_name == "multiple_choice":
            return AnswerPolicy.OPTION_SINGLE
        if question_type_name == "open_response":
            return AnswerPolicy.ACCEPTED_ANSWER
        return AnswerPolicy.UNSUPPORTED


class QuestionAnswerService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def read_answers_for_revision(self, *, revision_id: uuid.UUID) -> RevisionAnswersRead:
        revision = self._get_active_revision(revision_id, lock=False)
        options = list(self.db.scalars(
            select(AnswerOption).where(
                AnswerOption.revision_id == revision.id,
                AnswerOption.deleted_at.is_(None),
            ).order_by(AnswerOption.order_index, AnswerOption.id)
        ).all())
        accepted = list(self.db.scalars(
            select(AcceptedAnswer).where(
                AcceptedAnswer.revision_id == revision.id,
                AcceptedAnswer.deleted_at.is_(None),
            ).order_by(AcceptedAnswer.order_index, AcceptedAnswer.id)
        ).all())
        return RevisionAnswersRead(
            answer_policy=AnswerPolicyService.for_question_type_name(
                revision.question_form.question_type.name
            ),
            answer_options=[self._option_read(item) for item in options],
            accepted_answers=[self._accepted_read(item) for item in accepted],
        )

    def create_option(self, *, revision_id: uuid.UUID, request: AnswerOptionCreate) -> AnswerOptionRead:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            prepared = prepare_structured_text_write(request.document, request.format_version)
            maximum = self.db.scalar(select(func.max(AnswerOption.order_index)).where(
                AnswerOption.revision_id == revision.id, AnswerOption.deleted_at.is_(None)
            )) or 0
            option = AnswerOption(
                revision_id=revision.id, label=request.label, order_index=maximum + 1000,
                source_text=prepared.source_text, document_data=prepared.document_data,
                format_version=prepared.format_version, is_correct=False,
            )
            self.db.add(option)
            self.db.flush()
            self._touch(revision)
            self.db.commit()
            self.db.refresh(option)
            return self._option_read(option)
        except IntegrityError as exc:
            self.db.rollback()
            raise AnswerIntegrityConflictError("Active option label or order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def update_option(self, *, revision_id: uuid.UUID, option_id: uuid.UUID, request: AnswerOptionUpdate) -> AnswerOptionRead:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            option = self._active_option(revision.id, option_id)
            prepared = prepare_structured_text_write(request.document, request.format_version)
            option.label = request.label
            option.source_text = prepared.source_text
            option.document_data = prepared.document_data
            option.format_version = prepared.format_version
            self._touch(revision)
            self.db.commit()
            self.db.refresh(option)
            return self._option_read(option)
        except IntegrityError as exc:
            self.db.rollback()
            raise AnswerIntegrityConflictError("Active option label conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def delete_option(self, *, revision_id: uuid.UUID, option_id: uuid.UUID, expected_revision_updated_at: datetime) -> None:
        try:
            revision = self._editable_revision(revision_id, expected_revision_updated_at)
            option = self._active_option(revision.id, option_id)
            if option.is_correct:
                raise CorrectOptionDeleteError("A correct option must be unselected before deletion.")
            option.deleted_at = datetime.now(timezone.utc)
            self._touch(revision)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def reorder_options(self, *, revision_id: uuid.UUID, request: AnswerOrderRequest) -> list[AnswerOptionRead]:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            options = self._active_options_locked(revision.id)
            self._require_complete_order(options, request.answer_ids)
            self._apply_order(options, request.answer_ids)
            self._touch(revision)
            self.db.commit()
            return [self._option_read({item.id: item for item in options}[item_id]) for item_id in request.answer_ids]
        except IntegrityError as exc:
            self.db.rollback()
            raise AnswerIntegrityConflictError("Active option order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def set_correct_options(self, *, revision_id: uuid.UUID, request: SetCorrectOptionsRequest) -> list[AnswerOptionRead]:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            options = self._active_options_locked(revision.id)
            by_id = {item.id: item for item in options}
            if not set(request.option_ids).issubset(by_id):
                raise AnswerRecordNotFoundError("Correct option must belong to the active revision.")
            selected = set(request.option_ids)
            for option in options:
                option.is_correct = option.id in selected
            self._touch(revision)
            self.db.commit()
            return [self._option_read(item) for item in options]
        except Exception:
            self.db.rollback()
            raise

    def create_accepted_answer(self, *, revision_id: uuid.UUID, request: AcceptedAnswerCreate) -> AcceptedAnswerRead:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            prepared = prepare_structured_text_write(request.document, request.format_version)
            maximum = self.db.scalar(select(func.max(AcceptedAnswer.order_index)).where(
                AcceptedAnswer.revision_id == revision.id, AcceptedAnswer.deleted_at.is_(None)
            )) or 0
            answer = AcceptedAnswer(
                revision_id=revision.id, order_index=maximum + 1000,
                source_text=prepared.source_text, document_data=prepared.document_data,
                format_version=prepared.format_version,
            )
            self.db.add(answer)
            self.db.flush()
            self._touch(revision)
            self.db.commit()
            self.db.refresh(answer)
            return self._accepted_read(answer)
        except IntegrityError as exc:
            self.db.rollback()
            raise AnswerIntegrityConflictError("Active accepted-answer order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def update_accepted_answer(self, *, revision_id: uuid.UUID, answer_id: uuid.UUID, request: AcceptedAnswerUpdate) -> AcceptedAnswerRead:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            answer = self._active_accepted_answer(revision.id, answer_id)
            prepared = prepare_structured_text_write(request.document, request.format_version)
            answer.source_text = prepared.source_text
            answer.document_data = prepared.document_data
            answer.format_version = prepared.format_version
            self._touch(revision)
            self.db.commit()
            self.db.refresh(answer)
            return self._accepted_read(answer)
        except Exception:
            self.db.rollback()
            raise

    def delete_accepted_answer(self, *, revision_id: uuid.UUID, answer_id: uuid.UUID, expected_revision_updated_at: datetime) -> None:
        try:
            revision = self._editable_revision(revision_id, expected_revision_updated_at)
            answer = self._active_accepted_answer(revision.id, answer_id)
            answer.deleted_at = datetime.now(timezone.utc)
            self._touch(revision)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def reorder_accepted_answers(self, *, revision_id: uuid.UUID, request: AnswerOrderRequest) -> list[AcceptedAnswerRead]:
        try:
            revision = self._editable_revision(revision_id, request.expected_revision_updated_at)
            answers = list(self.db.scalars(
                select(AcceptedAnswer).where(
                    AcceptedAnswer.revision_id == revision.id,
                    AcceptedAnswer.deleted_at.is_(None),
                ).order_by(AcceptedAnswer.order_index, AcceptedAnswer.id).with_for_update()
            ).all())
            self._require_complete_order(answers, request.answer_ids)
            self._apply_order(answers, request.answer_ids)
            self._touch(revision)
            self.db.commit()
            by_id = {item.id: item for item in answers}
            return [self._accepted_read(by_id[item_id]) for item_id in request.answer_ids]
        except IntegrityError as exc:
            self.db.rollback()
            raise AnswerIntegrityConflictError("Active accepted-answer order conflicts.") from exc
        except Exception:
            self.db.rollback()
            raise

    def _get_active_revision(self, revision_id: uuid.UUID, *, lock: bool) -> QuestionRevision:
        statement = select(QuestionRevision).join(QuestionForm).join(QuestionFamily).join(
            QuestionType, QuestionType.id == QuestionForm.question_type_id
        ).where(
            QuestionRevision.id == revision_id,
            QuestionRevision.deleted_at.is_(None),
            QuestionForm.is_active.is_(True), QuestionForm.deleted_at.is_(None),
            QuestionFamily.is_active.is_(True), QuestionFamily.deleted_at.is_(None),
            QuestionType.is_active.is_(True), QuestionType.deleted_at.is_(None),
        )
        if lock:
            statement = statement.with_for_update()
        revision = self.db.scalar(statement)
        if revision is None:
            raise AnswerRevisionNotFoundError("Question revision was not found.")
        return revision

    def _editable_revision(self, revision_id: uuid.UUID, expected: datetime) -> QuestionRevision:
        revision = self._get_active_revision(revision_id, lock=True)
        if revision.status != QuestionRevisionStatus.DRAFT:
            raise AnswerRevisionNotEditableError("Question revision is not editable.")
        if revision.updated_at != expected:
            raise AnswerRevisionConflictError("Question revision was modified by another request.")
        return revision

    def _active_option(self, revision_id: uuid.UUID, option_id: uuid.UUID) -> AnswerOption:
        option = self.db.scalar(select(AnswerOption).where(
            AnswerOption.id == option_id, AnswerOption.revision_id == revision_id,
            AnswerOption.deleted_at.is_(None),
        ).with_for_update())
        if option is None:
            raise AnswerRecordNotFoundError("Answer option was not found in the revision.")
        return option

    def _active_accepted_answer(self, revision_id: uuid.UUID, answer_id: uuid.UUID) -> AcceptedAnswer:
        answer = self.db.scalar(select(AcceptedAnswer).where(
            AcceptedAnswer.id == answer_id, AcceptedAnswer.revision_id == revision_id,
            AcceptedAnswer.deleted_at.is_(None),
        ).with_for_update())
        if answer is None:
            raise AnswerRecordNotFoundError("Accepted answer was not found in the revision.")
        return answer

    def _active_options_locked(self, revision_id: uuid.UUID) -> list[AnswerOption]:
        return list(self.db.scalars(select(AnswerOption).where(
            AnswerOption.revision_id == revision_id, AnswerOption.deleted_at.is_(None),
        ).order_by(AnswerOption.order_index, AnswerOption.id).with_for_update()).all())

    @staticmethod
    def _require_complete_order(records, requested_ids: list[uuid.UUID]) -> None:
        if len(records) != len(requested_ids) or {item.id for item in records} != set(requested_ids):
            raise AnswerOrderSetMismatchError("Order must contain every active record exactly once.")

    def _apply_order(self, records, requested_ids: list[uuid.UUID]) -> None:
        by_id = {item.id: item for item in records}
        maximum = max((item.order_index for item in records), default=0)
        temporary = max(maximum, len(records) * 1000) + 1_000_000
        for position, item_id in enumerate(requested_ids, start=1):
            by_id[item_id].order_index = temporary + position * 1000
        self.db.flush()
        for position, item_id in enumerate(requested_ids, start=1):
            by_id[item_id].order_index = position * 1000

    @staticmethod
    def _touch(revision: QuestionRevision) -> None:
        revision.updated_at = datetime.now(timezone.utc)

    @staticmethod
    def _option_read(option: AnswerOption) -> AnswerOptionRead:
        return AnswerOptionRead(
            id=option.id, label=option.label, order_index=option.order_index,
            source_text=option.source_text,
            document=normalize_text_content(
                source_text=option.source_text, document_data=option.document_data,
                format_version=option.format_version,
            ),
            format_version=option.format_version, is_correct=option.is_correct,
        )

    @staticmethod
    def _accepted_read(answer: AcceptedAnswer) -> AcceptedAnswerRead:
        return AcceptedAnswerRead(
            id=answer.id, order_index=answer.order_index, source_text=answer.source_text,
            document=normalize_text_content(
                source_text=answer.source_text, document_data=answer.document_data,
                format_version=answer.format_version,
            ),
            format_version=answer.format_version,
        )
