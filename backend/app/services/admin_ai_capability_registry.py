from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.services.admin_ai_result import (
    AdminAICapabilityResult,
    AdminAIResultEnvelope,
    AdminAIResultKind,
    CapabilityClassification,
    CapabilityEffectScope,
)


InputModel = TypeVar("InputModel", bound=BaseModel)
OutputModel = TypeVar("OutputModel", bound=BaseModel)


class CapabilityAuthorizationPolicy(str, Enum):
    ADMIN_ONLY = "admin_only"


class CapabilityContextRequirement(str, Enum):
    CURRENT_REVISION = "current_revision"
    NONE = "none"


@dataclass(frozen=True, slots=True)
class AdminAICapabilityDefinition(Generic[InputModel, OutputModel]):
    name: str
    version: int
    classification: CapabilityClassification
    input_schema: type[InputModel]
    output_schema: type[OutputModel]
    authorization_policy: CapabilityAuthorizationPolicy
    context_requirements: tuple[CapabilityContextRequirement, ...]
    effect_scope: CapabilityEffectScope
    safe_description: str = ""
    execution_handler_id: str | None = None
    result_limit: int | None = None
    preview_handler_id: str | None = None
    canonical_executor_id: str | None = None

    def __post_init__(self) -> None:
        if not self.name or self.version <= 0:
            raise ValueError("Capability identity is invalid.")
        if not self.safe_description.strip():
            raise ValueError("Capability safe description is required.")
        if self.result_limit is not None and self.result_limit <= 0:
            raise ValueError("Capability result limit must be positive.")
        if self.classification == CapabilityClassification.READ_ONLY and self.canonical_executor_id is not None:
            raise ValueError("Read-only capabilities cannot declare a canonical executor.")


class AdminAICapabilityRegistryError(Exception):
    pass


class DuplicateAdminAICapabilityError(AdminAICapabilityRegistryError):
    pass


class UnknownAdminAICapabilityError(AdminAICapabilityRegistryError):
    pass


class InvalidAdminAICapabilityPayloadError(AdminAICapabilityRegistryError):
    pass


class AdminAICapabilityRegistry:
    """In-process allowlist; provider data contains no callable or SQL surface."""

    def __init__(self) -> None:
        self._definitions: dict[tuple[str, int], AdminAICapabilityDefinition] = {}

    def register(self, definition: AdminAICapabilityDefinition) -> None:
        key = (definition.name, definition.version)
        if key in self._definitions:
            raise DuplicateAdminAICapabilityError("Capability name/version is already registered.")
        self._definitions[key] = definition

    def resolve(self, *, name: str, version: int) -> AdminAICapabilityDefinition:
        definition = self._definitions.get((name, version))
        if definition is None:
            raise UnknownAdminAICapabilityError("Capability name/version is not registered.")
        return definition

    def definitions(self) -> tuple[AdminAICapabilityDefinition, ...]:
        return tuple(self._definitions[key] for key in sorted(self._definitions))

    def validate_input(self, *, name: str, version: int, payload: object) -> BaseModel:
        definition = self.resolve(name=name, version=version)
        return self._validate(definition.input_schema, payload)

    def validate_result(self, result: AdminAICapabilityResult) -> BaseModel:
        definition = self.resolve(
            name=result.capability_name,
            version=result.capability_version,
        )
        if (
            result.classification != definition.classification
            or result.effect_scope != definition.effect_scope
        ):
            raise InvalidAdminAICapabilityPayloadError(
                "Capability classification or effect scope does not match the registry."
            )
        return self._validate(definition.output_schema, result.payload)

    def validate_envelope(self, envelope: AdminAIResultEnvelope | object) -> AdminAIResultEnvelope:
        try:
            validated = AdminAIResultEnvelope.model_validate(envelope)
        except ValidationError as exc:
            raise InvalidAdminAICapabilityPayloadError("Admin AI result envelope is invalid.") from exc
        if validated.result_kind != AdminAIResultKind.UNSUPPORTED:
            for result in validated.capability_results:
                self.validate_result(result)
        return validated

    @staticmethod
    def _validate(schema: type[BaseModel], payload: object) -> BaseModel:
        try:
            return schema.model_validate(payload)
        except ValidationError as exc:
            raise InvalidAdminAICapabilityPayloadError("Capability payload is invalid.") from exc
