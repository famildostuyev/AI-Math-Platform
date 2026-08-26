from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Union

from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AIAuthoringProposalStatus, AnswerPolicy, ContentBlockType
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.services.authoring_action import (
    AuthoringActionEnvelope,
    CreateFormulaBlockAction,
    CreateTextBlockAction,
    DeleteBlockAction,
    ReorderBlockAction,
    UpdateFormulaBlockAction,
    UpdateTextBlockAction,
    CreateAnswerOptionAction, UpdateAnswerOptionAction, DeleteAnswerOptionAction,
    ReorderAnswerOptionsAction, SetCorrectAnswersAction,
    CreateAcceptedAnswerAction, UpdateAcceptedAnswerAction,
    DeleteAcceptedAnswerAction, ReorderAcceptedAnswersAction,
)
from app.services.question_authoring_context import (
    AuthoringBlockContext,
    AuthoringFormulaBlockContext,
    AuthoringRevisionContext,
    AuthoringTextBlockContext,
    AuthoringAnswerOptionContext,
    AuthoringAcceptedAnswerContext,
    QuestionAuthoringContextService,
)


PreviewChangeKind = Literal["created", "updated", "deleted", "reordered"]
PreviewWarningCode = Literal[
    "stale_revision",
    "destructive_delete",
    "formula_changed",
    "multiple_actions",
    "answer_option_deleted",
    "correct_answer_changed",
    "multiple_answer_changes",
]


class StrictFrozenPreviewModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AuthoringBlockOrderPreview(StrictFrozenPreviewModel):
    ordered_block_ids: tuple[uuid.UUID, ...]


class AuthoringAnswerOrderPreview(StrictFrozenPreviewModel):
    ordered_answer_ids: tuple[uuid.UUID, ...]


class AuthoringCorrectAnswerOptionPreview(StrictFrozenPreviewModel):
    option_id: uuid.UUID
    label: str | None
    source_text: str | None


class AuthoringCorrectAnswerPreview(StrictFrozenPreviewModel):
    correct_options: tuple[AuthoringCorrectAnswerOptionPreview, ...]


AuthoringPreviewValue = Union[
    AuthoringBlockContext, AuthoringBlockOrderPreview,
    AuthoringAnswerOptionContext, AuthoringAcceptedAnswerContext,
    AuthoringAnswerOrderPreview, AuthoringCorrectAnswerPreview,
]


class AuthoringProposalChange(StrictFrozenPreviewModel):
    action_index: int
    action_type: str
    change_kind: PreviewChangeKind
    block_id: uuid.UUID | None
    before: AuthoringPreviewValue | None
    after: AuthoringPreviewValue | None


class AuthoringProposalPreview(StrictFrozenPreviewModel):
    proposal_id: uuid.UUID
    source_revision_id: uuid.UUID
    source_revision_updated_at: datetime
    current_revision_updated_at: datetime
    proposal_status: AIAuthoringProposalStatus
    is_stale: bool
    action_count: int
    changes: tuple[AuthoringProposalChange, ...]
    warnings: tuple[PreviewWarningCode, ...]


class AIAuthoringProposalPreviewError(Exception):
    pass


class AIAuthoringProposalPreviewNotFoundError(AIAuthoringProposalPreviewError):
    pass


class AIAuthoringProposalPreviewInvalidEnvelopeError(AIAuthoringProposalPreviewError):
    pass


class AIAuthoringProposalPreviewInvalidTargetError(AIAuthoringProposalPreviewError):
    pass


class AIAuthoringProposalPreviewBlockTypeError(AIAuthoringProposalPreviewError):
    pass


class AIAuthoringProposalPreviewInvalidOrderError(AIAuthoringProposalPreviewError):
    pass


class AIAuthoringProposalPreviewService:
    def __init__(
        self,
        db: Session,
        *,
        context_service: QuestionAuthoringContextService | None = None,
    ) -> None:
        self.db = db
        self.context_service = context_service or QuestionAuthoringContextService(db)

    def build_preview(self, *, proposal_id: uuid.UUID) -> AuthoringProposalPreview:
        proposal = self.db.scalar(
            select(AIAuthoringProposal).where(
                AIAuthoringProposal.id == proposal_id,
                AIAuthoringProposal.deleted_at.is_(None),
            )
        )
        if proposal is None:
            raise AIAuthoringProposalPreviewNotFoundError(
                "AI authoring proposal was not found."
            )
        try:
            envelope = AuthoringActionEnvelope.model_validate(proposal.actions)
        except ValidationError as exc:
            raise AIAuthoringProposalPreviewInvalidEnvelopeError(
                "Stored authoring action envelope is invalid."
            ) from exc

        context = self.context_service.build_for_revision(
            revision_id=proposal.source_revision_id
        )
        changes = self._simulate(
            proposal_id=proposal.id,
            envelope=envelope,
            context=context,
        )
        is_stale = proposal.source_revision_updated_at != context.revision_updated_at
        warnings: list[PreviewWarningCode] = []
        if is_stale:
            warnings.append("stale_revision")
        if any(isinstance(action, DeleteBlockAction) for action in envelope.actions):
            warnings.append("destructive_delete")
        if any(
            isinstance(action, (UpdateFormulaBlockAction, CreateFormulaBlockAction))
            for action in envelope.actions
        ):
            warnings.append("formula_changed")
        if len(envelope.actions) > 1:
            warnings.append("multiple_actions")
        answer_actions = [action for action in envelope.actions if "answer" in action.action_type or "option" in action.action_type]
        if any(isinstance(action, DeleteAnswerOptionAction) for action in answer_actions):
            warnings.append("answer_option_deleted")
        if any(isinstance(action, SetCorrectAnswersAction) for action in answer_actions):
            warnings.append("correct_answer_changed")
        if len(answer_actions) > 1:
            warnings.append("multiple_answer_changes")

        return AuthoringProposalPreview(
            proposal_id=proposal.id,
            source_revision_id=proposal.source_revision_id,
            source_revision_updated_at=proposal.source_revision_updated_at,
            current_revision_updated_at=context.revision_updated_at,
            proposal_status=proposal.status,
            is_stale=is_stale,
            action_count=len(envelope.actions),
            changes=tuple(changes),
            warnings=tuple(warnings),
        )

    def _simulate(
        self,
        *,
        proposal_id: uuid.UUID,
        envelope: AuthoringActionEnvelope,
        context: AuthoringRevisionContext,
    ) -> list[AuthoringProposalChange]:
        ordered = list(context.blocks)
        block_by_id = {block.block_id: block for block in ordered}
        created_ids: set[uuid.UUID] = set()
        changes: list[AuthoringProposalChange] = []
        options = list(context.answer_options)
        option_by_id = {item.option_id: item for item in options}
        accepted = list(context.accepted_answers)
        accepted_by_id = {item.answer_id: item for item in accepted}
        created_option_ids: set[uuid.UUID] = set()
        created_answer_ids: set[uuid.UUID] = set()

        for action_index, action in enumerate(envelope.actions):
            if isinstance(action, UpdateTextBlockAction):
                before = self._require_target(block_by_id, action.block_id)
                if not isinstance(before, AuthoringTextBlockContext):
                    raise AIAuthoringProposalPreviewBlockTypeError(
                        "Text action targets a non-text block."
                    )
                after = AuthoringTextBlockContext(
                    block_type=ContentBlockType.TEXT,
                    block_id=before.block_id,
                    order=before.order,
                    source_text=self._project_text(action.payload.document),
                    document=action.payload.document,
                    format_version=action.payload.format_version,
                )
                self._replace(ordered, block_by_id, after)
                changes.append(self._change(action_index, action.action_type, "updated", before.block_id, before, after))
            elif isinstance(action, UpdateFormulaBlockAction):
                before = self._require_target(block_by_id, action.block_id)
                if not isinstance(before, AuthoringFormulaBlockContext):
                    raise AIAuthoringProposalPreviewBlockTypeError(
                        "Formula action targets a non-formula block."
                    )
                after = AuthoringFormulaBlockContext(
                    block_type=ContentBlockType.FORMULA,
                    block_id=before.block_id,
                    order=before.order,
                    source_latex=action.payload.source_latex,
                    format_version=action.payload.format_version,
                )
                self._replace(ordered, block_by_id, after)
                changes.append(self._change(action_index, action.action_type, "updated", before.block_id, before, after))
            elif isinstance(action, (CreateTextBlockAction, CreateFormulaBlockAction)):
                block_id = uuid.uuid5(proposal_id, f"preview:{action_index}:{action.action_type}")
                order = max((block.order for block in ordered), default=0) + 1000
                if isinstance(action, CreateTextBlockAction):
                    after = AuthoringTextBlockContext(
                        block_type=ContentBlockType.TEXT,
                        block_id=block_id,
                        order=order,
                        source_text=self._project_text(action.payload.document),
                        document=action.payload.document,
                        format_version=action.payload.format_version,
                    )
                else:
                    after = AuthoringFormulaBlockContext(
                        block_type=ContentBlockType.FORMULA,
                        block_id=block_id,
                        order=order,
                        source_latex=action.payload.source_latex,
                        format_version=action.payload.format_version,
                    )
                ordered.append(after)
                block_by_id[block_id] = after
                created_ids.add(block_id)
                changes.append(self._change(action_index, action.action_type, "created", block_id, None, after))
            elif isinstance(action, DeleteBlockAction):
                before = self._require_target(block_by_id, action.block_id)
                if action.block_id in created_ids:
                    raise AIAuthoringProposalPreviewInvalidTargetError(
                        "Stored action sequence targets an unavailable created block."
                    )
                ordered = [block for block in ordered if block.block_id != action.block_id]
                del block_by_id[action.block_id]
                changes.append(self._change(action_index, action.action_type, "deleted", before.block_id, before, None))
            elif isinstance(action, ReorderBlockAction):
                existing_ids = [
                    block.block_id for block in ordered if block.block_id not in created_ids
                ]
                if set(action.ordered_block_ids) != set(existing_ids) or len(
                    action.ordered_block_ids
                ) != len(existing_ids):
                    raise AIAuthoringProposalPreviewInvalidOrderError(
                        "Proposed block order does not match active canonical blocks."
                    )
                before_order = tuple(block.block_id for block in ordered)
                created = [block for block in ordered if block.block_id in created_ids]
                ordered = [block_by_id[block_id] for block_id in action.ordered_block_ids] + created
                normalized = []
                for position, block in enumerate(ordered, start=1):
                    normalized_block = block.model_copy(update={"order": position * 1000})
                    normalized.append(normalized_block)
                    block_by_id[normalized_block.block_id] = normalized_block
                ordered = normalized
                after_order = tuple(block.block_id for block in ordered)
                changes.append(self._change(
                    action_index,
                    action.action_type,
                    "reordered",
                    None,
                    AuthoringBlockOrderPreview(ordered_block_ids=before_order),
                    AuthoringBlockOrderPreview(ordered_block_ids=after_order),
                ))
            elif isinstance(action, CreateAnswerOptionAction):
                self._require_option_policy(context.answer_policy)
                option_id = uuid.uuid5(proposal_id, f"preview:{action_index}:{action.action_type}")
                after = AuthoringAnswerOptionContext(option_id=option_id, label=action.label,
                    order=max((item.order for item in options), default=0) + 1000,
                    source_text=self._project_text(action.payload.document), document=action.payload.document,
                    format_version=action.payload.format_version, is_correct=False)
                options.append(after); option_by_id[option_id] = after; created_option_ids.add(option_id)
                changes.append(self._change(action_index, action.action_type, "created", option_id, None, after))
            elif isinstance(action, UpdateAnswerOptionAction):
                self._require_option_policy(context.answer_policy)
                before = self._require_answer_target(option_by_id, action.option_id)
                after = before.model_copy(update={"label": action.label, "source_text": self._project_text(action.payload.document), "document": action.payload.document, "format_version": action.payload.format_version})
                options = [after if item.option_id == after.option_id else item for item in options]; option_by_id[after.option_id] = after
                changes.append(self._change(action_index, action.action_type, "updated", before.option_id, before, after))
            elif isinstance(action, SetCorrectAnswersAction):
                self._require_option_policy(context.answer_policy)
                active_ids = set(option_by_id)
                if not set(action.option_ids).issubset(active_ids) or (context.answer_policy == AnswerPolicy.OPTION_SINGLE and len(action.option_ids) > 1):
                    raise AIAuthoringProposalPreviewInvalidTargetError("Correct answer target violates canonical policy.")
                before_ids = tuple(item.option_id for item in options if item.is_correct)
                selected = set(action.option_ids)
                options = [item.model_copy(update={"is_correct": item.option_id in selected}) for item in options]
                option_by_id = {item.option_id: item for item in options}
                changes.append(self._change(action_index, action.action_type, "updated", None,
                    self._correct_answer_preview(before_ids, option_by_id),
                    self._correct_answer_preview(tuple(action.option_ids), option_by_id)))
            elif isinstance(action, DeleteAnswerOptionAction):
                self._require_option_policy(context.answer_policy)
                before = self._require_answer_target(option_by_id, action.option_id)
                if action.option_id in created_option_ids or before.is_correct:
                    raise AIAuthoringProposalPreviewInvalidTargetError("Correct or transient option cannot be deleted.")
                options = [item for item in options if item.option_id != action.option_id]; del option_by_id[action.option_id]
                changes.append(self._change(action_index, action.action_type, "deleted", before.option_id, before, None))
            elif isinstance(action, ReorderAnswerOptionsAction):
                self._require_option_policy(context.answer_policy)
                existing_ids = [item.option_id for item in options if item.option_id not in created_option_ids]
                if set(action.ordered_option_ids) != set(existing_ids):
                    raise AIAuthoringProposalPreviewInvalidOrderError("Option order does not match canonical options.")
                before = tuple(item.option_id for item in options)
                created = [item for item in options if item.option_id in created_option_ids]
                options = [option_by_id[item_id] for item_id in action.ordered_option_ids] + created
                options = [item.model_copy(update={"order": index * 1000}) for index, item in enumerate(options, 1)]
                option_by_id = {item.option_id: item for item in options}
                changes.append(self._change(action_index, action.action_type, "reordered", None,
                    AuthoringAnswerOrderPreview(ordered_answer_ids=before),
                    AuthoringAnswerOrderPreview(ordered_answer_ids=tuple(item.option_id for item in options))))
            elif isinstance(action, CreateAcceptedAnswerAction):
                self._require_accepted_policy(context.answer_policy)
                answer_id = uuid.uuid5(proposal_id, f"preview:{action_index}:{action.action_type}")
                after = AuthoringAcceptedAnswerContext(answer_id=answer_id,
                    order=max((item.order for item in accepted), default=0) + 1000,
                    source_text=self._project_text(action.payload.document), document=action.payload.document,
                    format_version=action.payload.format_version)
                accepted.append(after); accepted_by_id[answer_id] = after; created_answer_ids.add(answer_id)
                changes.append(self._change(action_index, action.action_type, "created", answer_id, None, after))
            elif isinstance(action, UpdateAcceptedAnswerAction):
                self._require_accepted_policy(context.answer_policy)
                before = self._require_answer_target(accepted_by_id, action.answer_id)
                after = before.model_copy(update={"source_text": self._project_text(action.payload.document), "document": action.payload.document, "format_version": action.payload.format_version})
                accepted = [after if item.answer_id == after.answer_id else item for item in accepted]; accepted_by_id[after.answer_id] = after
                changes.append(self._change(action_index, action.action_type, "updated", before.answer_id, before, after))
            elif isinstance(action, DeleteAcceptedAnswerAction):
                self._require_accepted_policy(context.answer_policy)
                before = self._require_answer_target(accepted_by_id, action.answer_id)
                if action.answer_id in created_answer_ids:
                    raise AIAuthoringProposalPreviewInvalidTargetError("Transient accepted answer cannot be deleted.")
                accepted = [item for item in accepted if item.answer_id != action.answer_id]; del accepted_by_id[action.answer_id]
                changes.append(self._change(action_index, action.action_type, "deleted", before.answer_id, before, None))
            elif isinstance(action, ReorderAcceptedAnswersAction):
                self._require_accepted_policy(context.answer_policy)
                existing_ids = [item.answer_id for item in accepted if item.answer_id not in created_answer_ids]
                if set(action.ordered_answer_ids) != set(existing_ids):
                    raise AIAuthoringProposalPreviewInvalidOrderError("Accepted-answer order does not match canonical answers.")
                before = tuple(item.answer_id for item in accepted)
                created = [item for item in accepted if item.answer_id in created_answer_ids]
                accepted = [accepted_by_id[item_id] for item_id in action.ordered_answer_ids] + created
                accepted = [item.model_copy(update={"order": index * 1000}) for index, item in enumerate(accepted, 1)]
                accepted_by_id = {item.answer_id: item for item in accepted}
                changes.append(self._change(action_index, action.action_type, "reordered", None,
                    AuthoringAnswerOrderPreview(ordered_answer_ids=before),
                    AuthoringAnswerOrderPreview(ordered_answer_ids=tuple(item.answer_id for item in accepted))))
        return changes

    @staticmethod
    def _correct_answer_preview(
        option_ids: tuple[uuid.UUID, ...],
        option_by_id: dict[uuid.UUID, AuthoringAnswerOptionContext],
    ) -> AuthoringCorrectAnswerPreview:
        return AuthoringCorrectAnswerPreview(correct_options=tuple(
            AuthoringCorrectAnswerOptionPreview(
                option_id=option_id,
                label=option_by_id[option_id].label if option_id in option_by_id else None,
                source_text=(
                    option_by_id[option_id].source_text
                    if option_id in option_by_id else None
                ),
            )
            for option_id in option_ids
        ))

    @staticmethod
    def _require_option_policy(policy: AnswerPolicy) -> None:
        if policy not in {AnswerPolicy.OPTION_SINGLE, AnswerPolicy.OPTION_MULTIPLE}:
            raise AIAuthoringProposalPreviewInvalidTargetError("Option action violates canonical policy.")

    @staticmethod
    def _require_accepted_policy(policy: AnswerPolicy) -> None:
        if policy != AnswerPolicy.ACCEPTED_ANSWER:
            raise AIAuthoringProposalPreviewInvalidTargetError("Accepted-answer action violates canonical policy.")

    @staticmethod
    def _require_answer_target(by_id, target_id):
        target = by_id.get(target_id)
        if target is None:
            raise AIAuthoringProposalPreviewInvalidTargetError("Answer action targets an unavailable record.")
        return target

    @staticmethod
    def _project_text(document) -> str:
        from app.schemas.structured_text import project_source_text

        return project_source_text(document)

    @staticmethod
    def _require_target(block_by_id, block_id):
        block = block_by_id.get(block_id)
        if block is None:
            raise AIAuthoringProposalPreviewInvalidTargetError(
                "Authoring action targets an unavailable block."
            )
        return block

    @staticmethod
    def _replace(ordered, block_by_id, after) -> None:
        for index, block in enumerate(ordered):
            if block.block_id == after.block_id:
                ordered[index] = after
                block_by_id[after.block_id] = after
                return

    @staticmethod
    def _change(action_index, action_type, change_kind, block_id, before, after):
        return AuthoringProposalChange(
            action_index=action_index,
            action_type=action_type,
            change_kind=change_kind,
            block_id=block_id,
            before=before,
            after=after,
        )
