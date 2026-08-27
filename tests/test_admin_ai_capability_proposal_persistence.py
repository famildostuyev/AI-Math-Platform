from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

from pydantic import BaseModel, ConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AdminAIResultKind, AIAuthoringProposalKind
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.question_revision import QuestionRevision
from app.services.admin_ai_capability_registry import (
    AdminAICapabilityDefinition,
    AdminAICapabilityRegistry,
    CapabilityAuthorizationPolicy,
    CapabilityContextRequirement,
)
from app.services.admin_ai_proposal_payload_service import (
    AdminAIProposalPayloadService,
    AdminAIProposalPayloadTamperedError,
)
from app.services.admin_ai_result import (
    AdminAICapabilityResult,
    AdminAIResultEnvelope,
    AdminAISourceSnapshot,
    CapabilityClassification,
    CapabilityEffectScope,
)

NOW = datetime(2026, 8, 27, 12, 0, tzinfo=timezone.utc)


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    value: str


def registry() -> AdminAICapabilityRegistry:
    result = AdminAICapabilityRegistry()
    result.register(AdminAICapabilityDefinition(
        name="test.change", version=1,
        classification=CapabilityClassification.MUTATION_PREPARATION,
        input_schema=Payload, output_schema=Payload,
        authorization_policy=CapabilityAuthorizationPolicy.ADMIN_ONLY,
        context_requirements=(CapabilityContextRequirement.CURRENT_REVISION,),
        effect_scope=CapabilityEffectScope.REVISION,
        safe_description="Prepare a test change.",
        preview_handler_id="test_preview", canonical_executor_id="test_executor",
    ))
    return result


def envelope(revision_id: uuid.UUID, value: str = "safe") -> AdminAIResultEnvelope:
    return AdminAIResultEnvelope(
        schema_version=1, result_kind="mutation_proposal",
        capability_results=(AdminAICapabilityResult(
            capability_name="test.change", capability_version=1,
            classification="mutation_preparation", effect_scope="revision",
            payload={"value": value},
        ),),
        source_snapshots=(AdminAISourceSnapshot(
            entity_type="question_revision", entity_id=revision_id, updated_at=NOW,
        ),), warnings=(),
    )


class AdminAICapabilityProposalPersistenceTest(unittest.TestCase):
    def build_service(self, db: MagicMock, revision: QuestionRevision, requester_id: uuid.UUID) -> AdminAIProposalPayloadService:
        db.scalar.side_effect = [revision, requester_id]
        return AdminAIProposalPayloadService(db, registry=registry())

    def test_validates_before_write_and_stores_immutable_hash_bundle(self) -> None:
        revision = QuestionRevision(id=uuid.uuid4(), updated_at=NOW)
        requester_id = uuid.uuid4()
        db = MagicMock()
        service = self.build_service(db, revision, requester_id)
        result = service.create_pending_proposal(
            envelope=envelope(revision.id), source_revision_id=revision.id,
            expected_revision_updated_at=NOW, provider_name="fake",
            model_name="model", prompt_version="v1", provider_schema_version=1,
            requested_by_user_id=requester_id,
        )
        self.assertEqual(result.proposal_kind, AIAuthoringProposalKind.CAPABILITY_BUNDLE)
        self.assertEqual(result.result_kind, AdminAIResultKind.MUTATION_PROPOSAL)
        self.assertEqual(result.capability_bundle_schema_version, 1)
        self.assertEqual(len(result.capability_bundle_hash), 64)
        self.assertIsNone(result.actions)
        db.commit.assert_called_once()

    def test_hydration_and_pre_accept_detect_tampering(self) -> None:
        revision_id = uuid.uuid4()
        item = AIAuthoringProposal(
            proposal_kind=AIAuthoringProposalKind.CAPABILITY_BUNDLE,
            result_kind=AdminAIResultKind.MUTATION_PROPOSAL,
            capability_bundle_schema_version=1,
            capability_bundle=envelope(revision_id).model_dump(mode="json"),
            capability_bundle_hash="0" * 64,
        )
        service = AdminAIProposalPayloadService(MagicMock(), registry=registry())
        with self.assertRaises(AdminAIProposalPayloadTamperedError):
            service.validate_before_accept(item)

    def test_transaction_rolls_back_if_persistence_fails(self) -> None:
        revision = QuestionRevision(id=uuid.uuid4(), updated_at=NOW)
        requester_id = uuid.uuid4()
        db = MagicMock()
        db.commit.side_effect = RuntimeError("database unavailable")
        service = self.build_service(db, revision, requester_id)
        with self.assertRaises(RuntimeError):
            service.create_pending_proposal(
                envelope=envelope(revision.id), source_revision_id=revision.id,
                expected_revision_updated_at=NOW, provider_name="fake",
                model_name="model", prompt_version="v1", provider_schema_version=1,
                requested_by_user_id=requester_id,
            )
        db.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
