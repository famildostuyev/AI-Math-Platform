from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import BaseModel, ConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.admin_ai_capability_registry import (
    AdminAICapabilityDefinition, AdminAICapabilityRegistry,
    CapabilityAuthorizationPolicy, CapabilityContextRequirement,
    DuplicateAdminAICapabilityError, InvalidAdminAICapabilityPayloadError,
    UnknownAdminAICapabilityError,
)
from app.services.admin_ai_result import AdminAICapabilityResult, CapabilityClassification, CapabilityEffectScope


class EmptyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SummaryOutput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    summary: str


def definition(version: int = 1) -> AdminAICapabilityDefinition:
    return AdminAICapabilityDefinition(
        name="admin_ai.informational", version=version,
        classification=CapabilityClassification.READ_ONLY,
        input_schema=EmptyInput, output_schema=SummaryOutput,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.NONE,),
        effect_scope=CapabilityEffectScope.NONE,
        safe_description="Return a test summary.",
    )


class AdminAICapabilityRegistryTest(unittest.TestCase):
    def test_registration_resolution_and_typed_payload_validation(self) -> None:
        registry = AdminAICapabilityRegistry(); registry.register(definition())
        resolved = registry.resolve(name="admin_ai.informational", version=1)
        self.assertEqual((resolved.classification.value, resolved.authorization_policy.value), ("read_only", "admin_only"))
        result = AdminAICapabilityResult(
            capability_name=resolved.name, capability_version=1,
            classification="read_only", effect_scope="none",
            payload={"summary": "Ready"},
        )
        self.assertEqual(registry.validate_result(result).summary, "Ready")

    def test_duplicate_unknown_version_malformed_and_extra_payload_reject(self) -> None:
        registry = AdminAICapabilityRegistry(); registry.register(definition())
        with self.assertRaises(DuplicateAdminAICapabilityError): registry.register(definition())
        for name, version in (("missing", 1), ("admin_ai.informational", 2)):
            with self.assertRaises(UnknownAdminAICapabilityError): registry.resolve(name=name, version=version)
        for payload in ({}, {"summary": "ok", "sql": "select *"}):
            result = AdminAICapabilityResult(
                capability_name="admin_ai.informational", capability_version=1,
                classification="read_only", effect_scope="none", payload=payload,
            )
            with self.assertRaises(InvalidAdminAICapabilityPayloadError): registry.validate_result(result)

    def test_provider_payload_cannot_supply_callable_or_sql_surface(self) -> None:
        fields = set(AdminAICapabilityResult.model_fields)
        self.assertTrue({"sql", "callable", "executor", "handler"}.isdisjoint(fields))


if __name__ == "__main__":
    unittest.main()
