from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AnswerPolicy
from app.models.question_form import QuestionForm
from app.models.question_revision import QuestionRevision
from app.models.question_type import QuestionType
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_proposal_payload_service import AdminAIProposalPayloadService
from app.services.admin_ai_result import (
    AdminAICapabilityResult,
    AdminAIResultEnvelope,
    AdminAIResultKind,
    AdminAISourceSnapshot,
    CapabilityClassification,
    CapabilityEffectScope,
)
from app.services.new_question_capability import NewQuestionProposalPayload
from app.services.question_answer_service import AnswerPolicyService


class NewQuestionCapabilityHandlerError(Exception):
    pass


class NewQuestionCapabilityHandler:
    """Prepares a new-question proposal; it never creates a canonical question."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.persistence = AdminAIProposalPayloadService(
            db, registry=build_admin_ai_foundation_registry(),
        )

    def create_pending_proposal(
        self, *, payload: NewQuestionProposalPayload | object,
        expected_revision_updated_at: datetime, provider_name: str,
        model_name: str, prompt_version: str, provider_schema_version: int,
        requested_by_user_id: uuid.UUID,
    ):
        generated = NewQuestionProposalPayload.model_validate(payload)
        source = self.db.scalar(select(QuestionRevision).where(
            QuestionRevision.id == generated.source_revision_id,
            QuestionRevision.deleted_at.is_(None),
        ))
        if source is None or source.updated_at != expected_revision_updated_at:
            raise NewQuestionCapabilityHandlerError("Source revision snapshot is missing or stale.")
        question_type = self.db.scalar(select(QuestionType).join(
            QuestionForm, QuestionForm.question_type_id == QuestionType.id,
        ).where(
            QuestionForm.id == source.question_form_id,
            QuestionForm.is_active.is_(True), QuestionForm.deleted_at.is_(None),
            QuestionType.id == generated.question_type_id,
            QuestionType.is_active.is_(True), QuestionType.deleted_at.is_(None),
        ))
        if (
            question_type is None or question_type.name != "multiple_choice"
            or AnswerPolicyService.for_question_type_name(question_type.name) != AnswerPolicy.OPTION_SINGLE
        ):
            raise NewQuestionCapabilityHandlerError("Only multiple_choice/option_single is supported.")
        envelope = AdminAIResultEnvelope(
            schema_version=1,
            result_kind=AdminAIResultKind.MUTATION_PROPOSAL,
            capability_results=(AdminAICapabilityResult(
                capability_name="question.create_new",
                capability_version=1,
                classification=CapabilityClassification.MUTATION_PREPARATION,
                effect_scope=CapabilityEffectScope.NEW_QUESTION,
                payload=generated.model_dump(mode="json"),
            ),),
            source_snapshots=(AdminAISourceSnapshot(
                entity_type="question_revision",
                entity_id=source.id,
                updated_at=source.updated_at,
            ),),
            warnings=(),
        )
        return self.persistence.create_pending_proposal(
            envelope=envelope,
            source_revision_id=source.id,
            expected_revision_updated_at=source.updated_at,
            provider_name=provider_name, model_name=model_name,
            prompt_version=prompt_version,
            provider_schema_version=provider_schema_version,
            requested_by_user_id=requested_by_user_id,
        )
