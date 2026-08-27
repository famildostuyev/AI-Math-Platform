from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AdminAIValidationCategory(str, Enum):
    RESPONSE_SCHEMA_INVALID = "response_schema_invalid"
    PLAN_SCHEMA_INVALID = "plan_schema_invalid"
    UNSUPPORTED_RESPONSE_INVALID = "unsupported_response_invalid"
    DUPLICATE_CALL_ID = "duplicate_call_id"
    DEPENDENCY_ORDER_INVALID = "dependency_order_invalid"
    CALL_LIMIT_EXCEEDED = "call_limit_exceeded"
    UNKNOWN_CAPABILITY = "unknown_capability"
    UNSUPPORTED_CAPABILITY_VERSION = "unsupported_capability_version"
    CAPABILITY_INPUT_INVALID = "capability_input_invalid"
    CAPABILITY_NOT_READ_ONLY = "capability_not_read_only"
    AUTHORIZATION_POLICY_INVALID = "authorization_policy_invalid"
    EXECUTION_HANDLER_NOT_ALLOWED = "execution_handler_not_allowed"
    RESULT_BUDGET_EXCEEDED = "result_budget_exceeded"
    GROUNDING_ID_INVALID = "grounding_id_invalid"
    GROUNDING_MISSING = "grounding_missing"
    RESULT_CONTRACT_INVALID = "result_contract_invalid"


class AdminAIValidationStage(str, Enum):
    PROVIDER_RESPONSE_PARSE = "provider_response_parse"
    PLANNER_RESPONSE_VALIDATION = "planner_response_validation"
    CAPABILITY_PLAN_VALIDATION = "capability_plan_validation"
    CAPABILITY_INPUT_VALIDATION = "capability_input_validation"
    GROUNDING_VALIDATION = "grounding_validation"


class AdminAIValidationDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    category: AdminAIValidationCategory
    stage: AdminAIValidationStage
    capability_name: str | None = None
    capability_version: int | None = Field(default=None, gt=0)
    call_index: int | None = Field(default=None, ge=0)
    retry_count: int = Field(default=0, ge=0)
