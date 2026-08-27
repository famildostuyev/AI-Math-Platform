from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.schemas.structured_text import project_source_text
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_proposal_payload_service import AdminAIProposalPayloadService
from app.services.new_question_capability import (
    NewQuestionFormulaBlock,
    NewQuestionProposalPayload,
    NewQuestionTextBlock,
)
from app.services.question_authoring_context import (
    AuthoringFormulaBlockContext,
    AuthoringRevisionContext,
    AuthoringTextBlockContext,
    QuestionAuthoringContextService,
)


class StrictNewQuestionPreviewModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class NewQuestionPreviewBlock(StrictNewQuestionPreviewModel):
    block_type: Literal["text", "formula"]
    source_text: str | None
    source_latex: str | None


class NewQuestionPreviewOption(StrictNewQuestionPreviewModel):
    label: str
    source_text: str
    is_correct: bool


class NewQuestionPreviewAggregate(StrictNewQuestionPreviewModel):
    blocks: tuple[NewQuestionPreviewBlock, ...]
    options: tuple[NewQuestionPreviewOption, ...]


class NewQuestionProposalPreview(StrictNewQuestionPreviewModel):
    proposal_id: uuid.UUID
    source_revision_id: uuid.UUID
    source_revision_updated_at: datetime
    current_revision_updated_at: datetime
    is_stale: bool
    source: NewQuestionPreviewAggregate
    generated: NewQuestionPreviewAggregate


class NewQuestionPreviewError(Exception):
    pass


class NewQuestionPreviewHandler:
    def __init__(self, db: Session, *, context_service: QuestionAuthoringContextService | None = None) -> None:
        self.persistence = AdminAIProposalPayloadService(
            db, registry=build_admin_ai_foundation_registry(),
        )
        self.context = context_service or QuestionAuthoringContextService(db)

    def build_preview(self, *, proposal_id: uuid.UUID) -> NewQuestionProposalPreview:
        proposal, envelope = self.persistence.get_validated_bundle(proposal_id=proposal_id)
        matches = tuple(
            item for item in envelope.capability_results
            if item.capability_name == "question.create_new" and item.capability_version == 1
        )
        if len(matches) != 1:
            raise NewQuestionPreviewError("New-question capability result is missing or ambiguous.")
        result = matches[0]
        generated = NewQuestionProposalPayload.model_validate(result.payload)
        source = self.context.build_for_revision(revision_id=proposal.source_revision_id)
        return NewQuestionProposalPreview(
            proposal_id=proposal.id,
            source_revision_id=source.revision_id,
            source_revision_updated_at=proposal.source_revision_updated_at,
            current_revision_updated_at=source.revision_updated_at,
            is_stale=proposal.source_revision_updated_at != source.revision_updated_at,
            source=self._source(source), generated=self._generated(generated),
        )

    @staticmethod
    def _source(context: AuthoringRevisionContext) -> NewQuestionPreviewAggregate:
        if any(not isinstance(block, (AuthoringTextBlockContext, AuthoringFormulaBlockContext)) for block in context.blocks):
            raise NewQuestionPreviewError("Source contains a block unsupported by new-question V1.")
        blocks = tuple(
            NewQuestionPreviewBlock(
                block_type="text", source_text=block.source_text, source_latex=None,
            ) if isinstance(block, AuthoringTextBlockContext) else NewQuestionPreviewBlock(
                block_type="formula", source_text=None, source_latex=block.source_latex,
            )
            for block in context.blocks
        )
        return NewQuestionPreviewAggregate(
            blocks=blocks,
            options=tuple(NewQuestionPreviewOption(
                label=option.label or "Variant", source_text=option.source_text,
                is_correct=option.is_correct,
            ) for option in context.answer_options),
        )

    @staticmethod
    def _generated(payload: NewQuestionProposalPayload) -> NewQuestionPreviewAggregate:
        blocks = tuple(
            NewQuestionPreviewBlock(
                block_type="text", source_text=project_source_text(block.payload.document), source_latex=None,
            ) if isinstance(block, NewQuestionTextBlock) else NewQuestionPreviewBlock(
                block_type="formula", source_text=None, source_latex=block.payload.source_latex,
            )
            for block in payload.content_blocks
        )
        return NewQuestionPreviewAggregate(
            blocks=blocks,
            options=tuple(NewQuestionPreviewOption(
                label=option.label, source_text=project_source_text(option.document),
                is_correct=option.local_key == payload.correct_option_key,
            ) for option in payload.answer_options),
        )
