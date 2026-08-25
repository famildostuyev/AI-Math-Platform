from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict

from app.services.authoring_action import AuthoringActionEnvelope
from app.services.question_authoring_context import AuthoringRevisionContext


class StrictFrozenAuthoringProviderModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AuthoringAssistantResult(StrictFrozenAuthoringProviderModel):
    action_envelope: AuthoringActionEnvelope
    provider_name: str
    model_name: str
    prompt_version: str
    provider_schema_version: int


class AuthoringAssistantProvider(Protocol):
    def propose_actions(
        self,
        *,
        instruction: str,
        context: AuthoringRevisionContext,
    ) -> AuthoringAssistantResult:
        ...


class AuthoringAssistantProviderError(Exception):
    pass


class AuthoringAssistantInvalidInstructionError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantInvalidContextError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantTimeoutError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantRateLimitError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantNetworkError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantAPIError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantInvalidResponseError(AuthoringAssistantProviderError):
    pass


class AuthoringAssistantInvalidActionTargetError(
    AuthoringAssistantInvalidResponseError
):
    pass


class AuthoringAssistantUnknownProviderError(AuthoringAssistantProviderError):
    pass
