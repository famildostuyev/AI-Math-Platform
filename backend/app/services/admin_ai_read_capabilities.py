from __future__ import annotations

import math
import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.enums import QuestionDifficulty, QuestionRevisionStatus, RoleName
from app.schemas.question_bank import QuestionBankItemRead, QuestionBankListQuery, QuestionBankSort
from app.services.admin_ai_result import (
    AdminAICapabilityResult,
    AdminAIResultEnvelope,
    AdminAISourceSnapshot,
    CapabilityClassification,
    CapabilityEffectScope,
)
from app.services.question_authoring_context import (
    AuthoringRevisionContext,
    QuestionAuthoringContextService,
)
from app.services.question_bank_service import QuestionBankService

SEARCH_DEFAULT_PAGE_SIZE = 20
SEARCH_MAX_PAGE_SIZE = 50
STATISTICS_PAGE_SIZE = 100
STATISTICS_MAX_MATCHES = 1_000
STATISTICS_MAX_GROUPS = 100


class StrictReadCapabilityModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class InspectCurrentQuestionInput(StrictReadCapabilityModel):
    schema_version: int = Field(default=1, ge=1, le=1)
    revision_id: uuid.UUID


class QuestionSearchFilters(StrictReadCapabilityModel):
    question_type_id: uuid.UUID | None = None
    status: QuestionRevisionStatus | None = None
    difficulty: QuestionDifficulty | None = None
    purpose_id: uuid.UUID | None = None
    source_id: uuid.UUID | None = None


class SearchQuestionsInput(StrictReadCapabilityModel):
    schema_version: int = Field(default=1, ge=1, le=1)
    filters: QuestionSearchFilters = QuestionSearchFilters()
    page: int = Field(default=1, ge=1, le=10_000)
    page_size: int = Field(default=SEARCH_DEFAULT_PAGE_SIZE, ge=1, le=SEARCH_MAX_PAGE_SIZE)


class QuestionSearchSummary(StrictReadCapabilityModel):
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    revision_id: uuid.UUID
    revision_number: int = Field(gt=0)
    status: QuestionRevisionStatus
    question_type_id: uuid.UUID
    question_type_name: str
    question_type_display_name: str
    difficulty: QuestionDifficulty | None
    primary_topic_id: uuid.UUID | None
    primary_topic_display_name: str | None
    source_id: uuid.UUID | None
    source_display_name: str | None
    block_count: int = Field(ge=0)
    text_preview: str | None


class SearchQuestionsOutput(StrictReadCapabilityModel):
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=SEARCH_MAX_PAGE_SIZE)
    total_pages: int = Field(ge=0)
    deterministic_order: str
    applied_filters: QuestionSearchFilters
    items: tuple[QuestionSearchSummary, ...]


class QuestionStatisticsDimension(str, Enum):
    QUESTION_TYPE = "question_type"
    PRIMARY_TOPIC = "primary_topic"
    DIFFICULTY = "difficulty"
    STATUS = "status"
    SOURCE = "source"


class AggregateQuestionStatisticsInput(StrictReadCapabilityModel):
    schema_version: int = Field(default=1, ge=1, le=1)
    filters: QuestionSearchFilters = QuestionSearchFilters()
    grouping_dimension: QuestionStatisticsDimension


class QuestionStatisticsGroup(StrictReadCapabilityModel):
    key: str
    label: str
    count: int = Field(ge=0)


class AggregateQuestionStatisticsOutput(StrictReadCapabilityModel):
    total: int = Field(ge=0)
    grouping_dimension: QuestionStatisticsDimension
    applied_filters: QuestionSearchFilters
    groups: tuple[QuestionStatisticsGroup, ...]
    groups_truncated: bool


class AdminAIReadCapabilityError(Exception):
    pass


class AdminAIReadCapabilityAuthorizationError(AdminAIReadCapabilityError):
    pass


class AdminAIReadCapabilityLimitError(AdminAIReadCapabilityError):
    pass


class AdminAIReadCapabilityExecutor:
    """Backend-owned typed read boundary; provider receives neither Session nor SQL."""

    def __init__(
        self, db: Session, *, context_service: QuestionAuthoringContextService | None = None,
        question_bank_service: QuestionBankService | None = None,
    ) -> None:
        self._context = context_service or QuestionAuthoringContextService(db)
        self._question_bank = question_bank_service or QuestionBankService(db)

    def inspect_current_question(
        self, *, actor_role: RoleName, request: InspectCurrentQuestionInput | object,
    ) -> AdminAIResultEnvelope:
        self._require_admin(actor_role)
        typed = InspectCurrentQuestionInput.model_validate(request)
        context = self._context.build_for_revision(revision_id=typed.revision_id)
        return self._informational(
            name="admin_ai.inspect_current_question",
            payload=context.model_dump(mode="json"),
            snapshots=(AdminAISourceSnapshot(
                entity_type="question_revision", entity_id=context.revision_id,
                updated_at=context.revision_updated_at,
            ),),
        )

    def hydrate_question_revision_host_context(
        self, *, actor_role: RoleName, revision_id: uuid.UUID,
    ) -> AdminAIResultEnvelope:
        """Resolve the host page through the same bounded canonical inspect projection."""
        return self.inspect_current_question(
            actor_role=actor_role,
            request=InspectCurrentQuestionInput(revision_id=revision_id),
        )

    def search_questions(
        self, *, actor_role: RoleName, request: SearchQuestionsInput | object,
    ) -> AdminAIResultEnvelope:
        self._require_admin(actor_role)
        typed = SearchQuestionsInput.model_validate(request)
        page = self._question_bank.list_questions(query=self._bank_query(
            typed.filters, page=typed.page, page_size=typed.page_size,
        ))
        output = SearchQuestionsOutput(
            total=page.total, page=page.page, page_size=page.page_size,
            total_pages=page.total_pages, deterministic_order="updated_at_desc_revision_id_desc",
            applied_filters=typed.filters,
            items=tuple(self._summary(item) for item in page.items),
        )
        return self._informational(
            name="admin_ai.search_questions", payload=output.model_dump(mode="json"),
        )

    def aggregate_question_statistics(
        self, *, actor_role: RoleName,
        request: AggregateQuestionStatisticsInput | object,
    ) -> AdminAIResultEnvelope:
        self._require_admin(actor_role)
        typed = AggregateQuestionStatisticsInput.model_validate(request)
        first = self._question_bank.list_questions(query=self._bank_query(
            typed.filters, page=1, page_size=STATISTICS_PAGE_SIZE,
        ))
        if first.total > STATISTICS_MAX_MATCHES:
            raise AdminAIReadCapabilityLimitError("Matched question count exceeds the V1 statistics limit.")
        items = list(first.items)
        for page_number in range(2, math.ceil(first.total / STATISTICS_PAGE_SIZE) + 1):
            page = self._question_bank.list_questions(query=self._bank_query(
                typed.filters, page=page_number, page_size=STATISTICS_PAGE_SIZE,
            ))
            items.extend(page.items)
        counts: dict[tuple[str, str], int] = {}
        for item in items:
            key = self._group_key(item, typed.grouping_dimension)
            counts[key] = counts.get(key, 0) + 1
        ordered = sorted(counts.items(), key=lambda entry: (-entry[1], entry[0][0]))
        output = AggregateQuestionStatisticsOutput(
            total=first.total, grouping_dimension=typed.grouping_dimension,
            applied_filters=typed.filters,
            groups=tuple(QuestionStatisticsGroup(key=key, label=label, count=count)
                         for (key, label), count in ordered[:STATISTICS_MAX_GROUPS]),
            groups_truncated=len(ordered) > STATISTICS_MAX_GROUPS,
        )
        return self._informational(
            name="admin_ai.aggregate_question_statistics",
            payload=output.model_dump(mode="json"),
        )

    @staticmethod
    def _require_admin(actor_role: RoleName) -> None:
        if actor_role != RoleName.ADMIN:
            raise AdminAIReadCapabilityAuthorizationError("Admin authorization is required.")

    @staticmethod
    def _bank_query(filters: QuestionSearchFilters, *, page: int, page_size: int) -> QuestionBankListQuery:
        return QuestionBankListQuery(
            question_type_id=filters.question_type_id, status=filters.status,
            difficulty=filters.difficulty, purpose_id=filters.purpose_id,
            source_id=filters.source_id, page=page, page_size=page_size,
            sort=QuestionBankSort.UPDATED_DESC,
        )

    @staticmethod
    def _summary(item: QuestionBankItemRead) -> QuestionSearchSummary:
        return QuestionSearchSummary(
            question_family_id=item.question_family_id, question_form_id=item.question_form_id,
            revision_id=item.revision_id, revision_number=item.revision_number,
            status=item.status, question_type_id=item.question_type.id,
            question_type_name=item.question_type.name,
            question_type_display_name=item.question_type.display_name,
            difficulty=item.difficulty,
            primary_topic_id=item.primary_topic.id if item.primary_topic else None,
            primary_topic_display_name=item.primary_topic.display_name if item.primary_topic else None,
            source_id=item.source.id if item.source else None,
            source_display_name=item.source.display_name if item.source else None,
            block_count=item.block_count, text_preview=item.text_preview,
        )

    @staticmethod
    def _group_key(item: QuestionBankItemRead, dimension: QuestionStatisticsDimension) -> tuple[str, str]:
        if dimension == QuestionStatisticsDimension.QUESTION_TYPE:
            return str(item.question_type.id), item.question_type.display_name
        if dimension == QuestionStatisticsDimension.PRIMARY_TOPIC:
            return ((str(item.primary_topic.id), item.primary_topic.display_name)
                    if item.primary_topic else ("none", "No primary topic"))
        if dimension == QuestionStatisticsDimension.DIFFICULTY:
            return ((item.difficulty.value, item.difficulty.value)
                    if item.difficulty else ("none", "No difficulty"))
        if dimension == QuestionStatisticsDimension.STATUS:
            return item.status.value, item.status.value
        return ((str(item.source.id), item.source.display_name)
                if item.source else ("none", "No source"))

    @staticmethod
    def _informational(
        *, name: str, payload: dict[str, object],
        snapshots: tuple[AdminAISourceSnapshot, ...] = (),
    ) -> AdminAIResultEnvelope:
        return AdminAIResultEnvelope(
            schema_version=1, result_kind="informational",
            capability_results=(AdminAICapabilityResult(
                capability_name=name, capability_version=1,
                classification=CapabilityClassification.READ_ONLY,
                effect_scope=CapabilityEffectScope.NONE, payload=payload,
            ),), source_snapshots=snapshots, warnings=(),
        )
