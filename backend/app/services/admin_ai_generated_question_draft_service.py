from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AdminAIGeneratedQuestionDraftStatus, RoleName
from app.models.admin_ai_generated_question_draft import AdminAIGeneratedQuestionDraft
from app.models.question_revision import QuestionRevision
from app.models.question_type import QuestionType
from app.models.user import User
from app.schemas.question_editor import QuestionDraftCreate
from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft
from app.services.authoring_action import (
    CreateAnswerOptionAction,
    CreateFormulaBlockAction,
    CreateSolutionAction,
    CreateSolutionFormulaBlockAction,
    CreateSolutionTextBlockAction,
    CreateTextBlockAction,
    SetCorrectAnswersAction,
    TextAuthoringPayload,
    FormulaAuthoringPayload,
)
from app.services.question_editor_service import QuestionEditorService
from app.schemas.structured_text import (
    InlineMathNode,
    ParagraphNode,
    StructuredTextDocument,
    TextNode,
    legacy_source_text_to_document,
)


class AdminAIGeneratedQuestionDraftError(Exception):
    pass


class AdminAIGeneratedQuestionDraftAccessError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftNotFoundError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftOwnerNotFoundError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftSourceNotFoundError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftNotPromotableError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftQuestionTypeError(AdminAIGeneratedQuestionDraftError):
    pass


class AdminAIGeneratedQuestionDraftService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_from_generated_draft(
        self, *, draft: AdminAIGeneratedDraft, owner_user_id: uuid.UUID,
        actor_role: RoleName, source_revision_id: uuid.UUID | None = None,
    ) -> AdminAIGeneratedQuestionDraft:
        self._require_admin(actor_role)
        typed_draft = AdminAIGeneratedDraft.model_validate(draft)
        owner = self.db.scalar(select(User).where(
            User.id == owner_user_id, User.is_active.is_(True), User.deleted_at.is_(None),
        ))
        if owner is None:
            raise AdminAIGeneratedQuestionDraftOwnerNotFoundError("Active draft owner was not found.")
        if source_revision_id is not None:
            source = self.db.scalar(select(QuestionRevision).where(
                QuestionRevision.id == source_revision_id,
                QuestionRevision.deleted_at.is_(None),
            ))
            if source is None:
                raise AdminAIGeneratedQuestionDraftSourceNotFoundError("Active source revision was not found.")
        record = AdminAIGeneratedQuestionDraft(
            owner_user_id=owner_user_id,
            source_revision_id=source_revision_id,
            status=AdminAIGeneratedQuestionDraftStatus.ACTIVE,
            draft_kind=typed_draft.draft_kind,
            format_hint=typed_draft.format_hint,
            title=typed_draft.title,
            content=typed_draft.content.model_dump(mode="json"),
            answer_options=[item.model_dump(mode="json") for item in typed_draft.answer_options],
            correct_option_labels=list(typed_draft.correct_option_labels),
            explanation=(typed_draft.explanation.model_dump(mode="json") if typed_draft.explanation else None),
            is_canonical=False,
        )
        try:
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            return record
        except Exception:
            self.db.rollback()
            raise

    def get_draft(
        self, *, draft_id: uuid.UUID, actor_user_id: uuid.UUID,
        actor_role: RoleName, for_update: bool = False,
    ) -> AdminAIGeneratedQuestionDraft:
        self._require_admin(actor_role)
        statement = select(AdminAIGeneratedQuestionDraft).where(
            AdminAIGeneratedQuestionDraft.id == draft_id,
            AdminAIGeneratedQuestionDraft.owner_user_id == actor_user_id,
            AdminAIGeneratedQuestionDraft.deleted_at.is_(None),
        )
        if for_update:
            statement = statement.with_for_update()
        record = self.db.scalar(statement)
        if record is None:
            raise AdminAIGeneratedQuestionDraftNotFoundError("Active owned Admin AI draft was not found.")
        return record

    def promote_to_new_question(
        self, *, draft_id: uuid.UUID, actor_user_id: uuid.UUID,
        actor_role: RoleName,
    ):
        """Atomically turn one owned active AI draft into a new canonical draft."""

        try:
            record = self.get_draft(
                draft_id=draft_id, actor_user_id=actor_user_id,
                actor_role=actor_role, for_update=True,
            )
            if record.status != AdminAIGeneratedQuestionDraftStatus.ACTIVE:
                raise AdminAIGeneratedQuestionDraftNotPromotableError(
                    "Only an active generated question draft can be promoted."
                )
            generated = self.reconstruct_generated_draft(record)
            if generated.draft_kind != "question":
                raise AdminAIGeneratedQuestionDraftNotPromotableError(
                    "Only a generated question draft can be promoted."
                )

            question_type_name = (
                "multiple_choice" if generated.format_hint == "multiple_choice"
                else "open_response"
            )
            question_type = self.db.scalar(select(QuestionType).where(
                QuestionType.name == question_type_name,
                QuestionType.is_active.is_(True),
                QuestionType.deleted_at.is_(None),
            ))
            if question_type is None:
                raise AdminAIGeneratedQuestionDraftQuestionTypeError(
                    "The canonical question type required by the draft is unavailable."
                )

            editor = QuestionEditorService(self.db)
            canonical = editor.create_draft(
                draft=QuestionDraftCreate(question_type_id=question_type.id),
                actor_id=actor_user_id,
                commit=False,
            )
            actions = self._promotion_actions(generated)
            editor.apply_action_set(
                revision_id=canonical.revision_id,
                expected_revision_updated_at=canonical.updated_at,
                actions=actions,
            )
            record.status = AdminAIGeneratedQuestionDraftStatus.PROMOTED
            self.db.commit()
            return canonical
        except Exception:
            self.db.rollback()
            raise

    @classmethod
    def _promotion_actions(cls, draft: AdminAIGeneratedDraft):
        actions = cls._content_actions(draft.content, solution=False)
        option_ids_by_label: dict[str, uuid.UUID] = {}
        for option in draft.answer_options:
            option_id = uuid.uuid4()
            option_ids_by_label[option.label] = option_id
            document = (
                cls._content_document(option.content)
                if option.content is not None
                else legacy_source_text_to_document(option.text)
            )
            actions.append(CreateAnswerOptionAction(
                action_type="create_answer_option", option_id=option_id,
                label=option.label,
                payload=TextAuthoringPayload(document=document, format_version=1),
            ))
        if draft.correct_option_labels:
            actions.append(SetCorrectAnswersAction(
                action_type="set_correct_answers",
                option_ids=[option_ids_by_label[label] for label in draft.correct_option_labels],
            ))
        if draft.explanation is not None:
            actions.append(CreateSolutionAction(action_type="create_solution"))
            actions.extend(cls._content_actions(draft.explanation, solution=True))
        return actions

    @staticmethod
    def _content_document(content) -> StructuredTextDocument:
        nodes = []
        for segment in content.segments:
            if segment.type == "text":
                nodes.append(TextNode(type="text", text=segment.text))
            else:
                nodes.append(InlineMathNode(type="inline_math", latex=segment.latex))
        return StructuredTextDocument(
            type="document", content=[ParagraphNode(type="paragraph", content=nodes)],
        )

    @classmethod
    def _content_actions(cls, content, *, solution: bool):
        actions = []
        for segment in content.segments:
            if segment.type == "text":
                payload = TextAuthoringPayload(
                    document=legacy_source_text_to_document(segment.text), format_version=1,
                )
                action = (
                    CreateSolutionTextBlockAction(
                        action_type="create_solution_text_block", payload=payload,
                    )
                    if solution else
                    CreateTextBlockAction(action_type="create_text_block", payload=payload)
                )
            else:
                payload = FormulaAuthoringPayload(
                    source_latex=segment.latex, format_version=1,
                )
                action = (
                    CreateSolutionFormulaBlockAction(
                        action_type="create_solution_formula_block", payload=payload,
                    )
                    if solution else
                    CreateFormulaBlockAction(action_type="create_formula_block", payload=payload)
                )
            actions.append(action)
        return actions

    @staticmethod
    def reconstruct_generated_draft(record: AdminAIGeneratedQuestionDraft) -> AdminAIGeneratedDraft:
        return AdminAIGeneratedDraft.model_validate({
            "draft_kind": record.draft_kind,
            "format_hint": record.format_hint,
            "title": record.title,
            "content": record.content,
            "answer_options": record.answer_options,
            "correct_option_labels": record.correct_option_labels,
            "explanation": record.explanation,
            "is_canonical": record.is_canonical,
        })

    @staticmethod
    def _require_admin(actor_role: RoleName) -> None:
        if actor_role != RoleName.ADMIN:
            raise AdminAIGeneratedQuestionDraftAccessError("Admin role is required for generated drafts.")
