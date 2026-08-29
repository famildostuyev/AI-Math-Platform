from __future__ import annotations

import json
import uuid
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.core.enums import RoleName
from app.services.admin_ai_generated_question_draft_service import (
    AdminAIGeneratedQuestionDraftService,
)
from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft, AdminAIHostContext
from app.schemas.admin_ai import ADMIN_AI_SIMILAR_QUESTION_MAX_COUNT


class AdminAISimilarQuestionError(Exception):
    pass


class AdminAISimilarQuestionCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    generated_draft: AdminAIGeneratedDraft
    applied_admin_constraints: str = Field(min_length=1)

    @model_validator(mode="after")
    def require_question(self) -> "AdminAISimilarQuestionCandidate":
        if self.generated_draft.draft_kind != "question":
            raise ValueError("Similar-question candidates must be question drafts.")
        if self.generated_draft.explanation is None:
            raise ValueError("Similar-question candidates must include a structured solution.")
        segments = self.generated_draft.explanation.segments
        if any(
            "step_index" not in segment.model_fields_set
            or "presentation_role" not in segment.model_fields_set
            or segment.presentation_role is None
            for segment in segments
        ):
            raise ValueError(
                "New similar-question solution segments must explicitly include semantic metadata."
            )
        if not any(segment.step_index is not None for segment in segments):
            raise ValueError(
                "New similar-question solutions must include at least one numbered reasoning step."
            )
        return self


class AdminAISimilarQuestionProviderResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[1]
    candidates: tuple[AdminAISimilarQuestionCandidate, ...] = Field(
        min_length=1, max_length=ADMIN_AI_SIMILAR_QUESTION_MAX_COUNT,
    )


class AdminAISimilarQuestionGenerator(Protocol):
    def generate_similar_questions(
        self, *, source_context: AdminAIHostContext, requested_count: int,
        admin_constraints: str,
    ) -> AdminAISimilarQuestionProviderResponse:
        ...


class AdminAISimilarQuestionService:
    def __init__(
        self, *, draft_service: AdminAIGeneratedQuestionDraftService,
        generator: AdminAISimilarQuestionGenerator,
    ) -> None:
        self._draft_service = draft_service
        self._generator = generator

    def generate(
        self, *, source_context: AdminAIHostContext, source_revision_id: uuid.UUID,
        requested_count: int, admin_constraints: str, actor_user_id: uuid.UUID,
        actor_role: RoleName,
    ):
        response = self._generator.generate_similar_questions(
            source_context=source_context,
            requested_count=requested_count,
            admin_constraints=admin_constraints,
        )
        try:
            typed = AdminAISimilarQuestionProviderResponse.model_validate(response)
        except ValidationError as exc:
            raise AdminAISimilarQuestionError("Provider candidates are structurally invalid.") from exc
        if len(typed.candidates) != requested_count:
            raise AdminAISimilarQuestionError("Provider candidate count does not match the request.")
        if any(item.applied_admin_constraints != admin_constraints for item in typed.candidates):
            raise AdminAISimilarQuestionError("A candidate did not acknowledge the mandatory Admin constraints.")
        fingerprints = [json.dumps(
            item.generated_draft.model_dump(mode="json"),
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ) for item in typed.candidates]
        if len(fingerprints) != len(set(fingerprints)):
            raise AdminAISimilarQuestionError("Similar-question candidates must be distinct.")
        return self._draft_service.create_many_from_generated_drafts(
            drafts=tuple(item.generated_draft for item in typed.candidates),
            owner_user_id=actor_user_id, actor_role=actor_role,
            source_revision_id=source_revision_id,
        )
