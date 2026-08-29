from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from pydantic import BaseModel, ConfigDict, ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import RoleName
from app.services.admin_ai_capability_registry import (
    AdminAICapabilityDefinition,
    AdminAIExecutionRequirement,
    CapabilityAuthorizationPolicy,
    CapabilityContextRequirement,
)
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_orchestrator import (
    AdminAIOrchestrator,
    AdminAIPlanValidationError,
    AdminAIPlannerResponse,
)
from app.services.admin_ai_result import CapabilityClassification, CapabilityEffectScope


class EmptyModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class FakeProvider:
    def __init__(self, response: AdminAIPlannerResponse) -> None:
        self.response = response
        self.calls = 0

    def plan(self, **_: object) -> AdminAIPlannerResponse:
        self.calls += 1
        return self.response


def response(
    kind: str, requirements: tuple[str, ...], *, answer: str | None = None,
    context: str = "none", plan: dict | None = None,
) -> AdminAIPlannerResponse:
    return AdminAIPlannerResponse.model_validate({
        "schema_version": 1, "outcome_kind": kind,
        "context_requirement": context, "requirements": requirements,
        "answer_text": answer, "plan": plan,
        "mutation_code": "admin_approval_required" if kind == "mutation_proposal" else None,
        "unsupported_code": "capability_unavailable" if kind == "unsupported" else None,
    })


def orchestrator(provider: FakeProvider, registry=None) -> AdminAIOrchestrator:
    return AdminAIOrchestrator(
        planner=provider, registry=registry or build_admin_ai_foundation_registry(),
        read_executor=MagicMock(),
    )


class AdminAIUniversalRequirementTest(unittest.TestCase):
    def test_unknown_duplicate_and_inconsistent_requirements_reject(self) -> None:
        invalid = (
            ("unknown_future_kind",),
            ("model_reasoning", "model_reasoning"),
        )
        for requirements in invalid:
            with self.subTest(requirements=requirements), self.assertRaises(ValidationError):
                response("direct_answer", requirements, answer="Cavab")
        with self.assertRaises(ValidationError):
            response("direct_answer", ("current_question_content",), answer="Cavab", context="none")

    def test_unavailable_visual_external_and_file_requirements_are_typed(self) -> None:
        for requirement in ("visual_generation", "external_research", "file_access"):
            with self.subTest(requirement=requirement):
                provider = FakeProvider(response("unsupported", (requirement,)))
                result = orchestrator(provider).run(
                    actor_role=RoleName.ADMIN, instruction="Safe fake instruction",
                )
                self.assertEqual(result.fulfillment_status, "unavailable")
                self.assertEqual([item.value for item in result.unmet_requirements], [requirement])
                self.assertEqual(result.execution_trace, ())

    def test_provider_cannot_claim_unavailable_visual_as_direct_completion(self) -> None:
        provider = FakeProvider(response(
            "direct_answer", ("visual_generation",), answer="Visual yaradıldı.",
        ))
        with self.assertRaises(AdminAIPlanValidationError):
            orchestrator(provider).run(actor_role=RoleName.ADMIN, instruction="Safe fake instruction")

    def test_canonical_mutation_request_stays_at_typed_boundary(self) -> None:
        provider = FakeProvider(response(
            "mutation_proposal", ("platform_mutation",),
            answer="Dəyişiklik tətbiq edilməyib.",
        ))
        result = orchestrator(provider).run(
            actor_role=RoleName.ADMIN, instruction="Safe fake mutation request",
        )
        self.assertEqual(result.response_kind, "mutation_proposal")
        self.assertEqual(result.fulfillment_status, "unavailable")
        self.assertEqual(result.limitation_code, "capability_unavailable")
        self.assertEqual(result.execution_trace, ())

    def test_registry_metadata_can_advertise_future_requirement_without_phrase_router(self) -> None:
        registry = build_admin_ai_foundation_registry()
        registry.register(AdminAICapabilityDefinition(
            name="future.visual", version=1,
            classification=CapabilityClassification.READ_ONLY,
            input_schema=EmptyModel, output_schema=EmptyModel,
            authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
            context_requirements=(CapabilityContextRequirement.NONE,),
            effect_scope=CapabilityEffectScope.NONE,
            satisfies_requirements=(AdminAIExecutionRequirement.VISUAL_GENERATION,),
            safe_description="Produce one bounded future visual result.",
            execution_handler_id="future_visual_v1", result_limit=1,
        ))
        provider = FakeProvider(response("unsupported", ("external_research",)))
        instance = orchestrator(provider, registry)
        self.assertIn(
            AdminAIExecutionRequirement.VISUAL_GENERATION,
            instance._globally_available_requirements(),
        )
        self.assertNotIn(
            AdminAIExecutionRequirement.EXTERNAL_RESEARCH,
            instance._globally_available_requirements(),
        )


if __name__ == "__main__":
    unittest.main()
