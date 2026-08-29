from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.services.admin_ai_capability_registry import (
    AdminAICapabilityDefinition,
    AdminAICapabilityRegistry,
    CapabilityAuthorizationPolicy,
    CapabilityContextRequirement,
    AdminAIExecutionRequirement,
)
from app.services.admin_ai_result import (
    CapabilityClassification,
    CapabilityEffectScope,
    InformationalCapabilityPayload,
)
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.new_question_capability import NewQuestionProposalPayload
from app.services.admin_ai_read_capabilities import (
    AggregateQuestionStatisticsInput,
    AggregateQuestionStatisticsOutput,
    InspectCurrentQuestionInput,
    SearchQuestionsInput,
    SearchQuestionsOutput,
    STATISTICS_MAX_GROUPS,
    SEARCH_MAX_PAGE_SIZE,
)
from app.services.question_authoring_context import AuthoringRevisionContext


class EmptyCapabilityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def build_admin_ai_foundation_registry() -> AdminAICapabilityRegistry:
    registry = AdminAICapabilityRegistry()
    registry.register(AdminAICapabilityDefinition(
        name="admin_ai.inspect_current_question", version=1,
        classification=CapabilityClassification.READ_ONLY,
        input_schema=InspectCurrentQuestionInput,
        output_schema=AuthoringRevisionContext,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.CURRENT_REVISION,),
        satisfies_requirements=(
            AdminAIExecutionRequirement.CURRENT_QUESTION_CONTENT,
            AdminAIExecutionRequirement.PLATFORM_READ,
        ),
        effect_scope=CapabilityEffectScope.NONE,
        safe_description="Inspect one active question revision and its authoring context.",
        execution_handler_id="inspect_current_question_v1",
        result_limit=1,
    ))
    registry.register(AdminAICapabilityDefinition(
        name="admin_ai.search_questions", version=1,
        classification=CapabilityClassification.READ_ONLY,
        input_schema=SearchQuestionsInput,
        output_schema=SearchQuestionsOutput,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.NONE,),
        satisfies_requirements=(AdminAIExecutionRequirement.PLATFORM_READ,),
        effect_scope=CapabilityEffectScope.NONE,
        safe_description="Search active question-bank entries with bounded typed filters.",
        execution_handler_id="search_questions_v1",
        result_limit=SEARCH_MAX_PAGE_SIZE,
    ))
    registry.register(AdminAICapabilityDefinition(
        name="admin_ai.aggregate_question_statistics", version=1,
        classification=CapabilityClassification.READ_ONLY,
        input_schema=AggregateQuestionStatisticsInput,
        output_schema=AggregateQuestionStatisticsOutput,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.NONE,),
        satisfies_requirements=(AdminAIExecutionRequirement.PLATFORM_READ,),
        effect_scope=CapabilityEffectScope.NONE,
        safe_description="Aggregate bounded question-bank counts by one allowlisted dimension.",
        execution_handler_id="aggregate_question_statistics_v1",
        result_limit=STATISTICS_MAX_GROUPS,
    ))
    registry.register(AdminAICapabilityDefinition(
        name="admin_ai.informational", version=1,
        classification=CapabilityClassification.READ_ONLY,
        input_schema=EmptyCapabilityInput,
        output_schema=InformationalCapabilityPayload,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.NONE,),
        effect_scope=CapabilityEffectScope.NONE,
        safe_description="Return a typed informational analysis summary.",
    ))
    registry.register(AdminAICapabilityDefinition(
        name="authoring.modify_revision", version=1,
        classification=CapabilityClassification.MUTATION_PREPARATION,
        input_schema=EmptyCapabilityInput,
        output_schema=AuthoringActionEnvelope,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.CURRENT_REVISION,),
        effect_scope=CapabilityEffectScope.REVISION,
        safe_description="Prepare typed changes to the current question revision.",
        preview_handler_id="authoring_action_preview_v1",
        canonical_executor_id="authoring_action_apply_v1",
    ))
    registry.register(AdminAICapabilityDefinition(
        name="question.create_new", version=1,
        classification=CapabilityClassification.MUTATION_PREPARATION,
        input_schema=EmptyCapabilityInput,
        output_schema=NewQuestionProposalPayload,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.CURRENT_REVISION,),
        effect_scope=CapabilityEffectScope.NEW_QUESTION,
        safe_description="Prepare a typed proposal for a new question without creating it.",
        preview_handler_id="new_question_preview_v1",
        canonical_executor_id=None,
    ))
    return registry
