from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AdminAIResultKind, AIAuthoringProposalKind, AIAuthoringProposalStatus
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.question_revision import QuestionRevision
from app.models.user import User
from app.services.admin_ai_capability_registry import AdminAICapabilityRegistry
from app.services.admin_ai_result import AdminAIResultEnvelope, admin_ai_result_hash


class AdminAIProposalPayloadError(Exception):
    pass


class AdminAIProposalPayloadValidationError(AdminAIProposalPayloadError):
    pass


class AdminAIProposalPayloadTamperedError(AdminAIProposalPayloadError):
    pass


class AdminAIProposalPayloadNotFoundError(AdminAIProposalPayloadError):
    pass


class AdminAIProposalPayloadService:
    """Persistence boundary for immutable, registry-validated result bundles."""

    def __init__(self, db: Session, *, registry: AdminAICapabilityRegistry) -> None:
        self.db = db
        self.registry = registry

    def create_pending_proposal(
        self, *, envelope: AdminAIResultEnvelope | object,
        source_revision_id: uuid.UUID, expected_revision_updated_at: datetime,
        provider_name: str, model_name: str, prompt_version: str,
        provider_schema_version: int, requested_by_user_id: uuid.UUID,
        request_message_id: uuid.UUID | None = None,
    ) -> AIAuthoringProposal:
        validated = self._validate_bundle(envelope)
        if validated.result_kind != AdminAIResultKind.MUTATION_PROPOSAL:
            raise AdminAIProposalPayloadValidationError(
                "Only mutation-proposal results have proposal lifecycle persistence."
            )
        revision = self.db.scalar(select(QuestionRevision).where(
            QuestionRevision.id == source_revision_id,
            QuestionRevision.deleted_at.is_(None),
        ))
        if revision is None or revision.updated_at != expected_revision_updated_at:
            raise AdminAIProposalPayloadValidationError("Source revision snapshot is missing or stale.")
        if not any(
            snapshot.entity_type == "question_revision"
            and snapshot.entity_id == source_revision_id
            and snapshot.updated_at == expected_revision_updated_at
            for snapshot in validated.source_snapshots
        ):
            raise AdminAIProposalPayloadValidationError("Result source snapshot is inconsistent.")
        requester = self.db.scalar(select(User.id).where(
            User.id == requested_by_user_id, User.is_active.is_(True), User.deleted_at.is_(None),
        ))
        if requester is None:
            raise AdminAIProposalPayloadValidationError("Active requester was not found.")
        if request_message_id is not None:
            raise AdminAIProposalPayloadValidationError(
                "Request-message binding is not enabled for generic capability proposals yet."
            )
        self._validate_provenance(provider_name, model_name, prompt_version, provider_schema_version)
        serialized = validated.model_dump(mode="json")
        proposal = AIAuthoringProposal(
            source_revision_id=revision.id,
            source_revision_updated_at=revision.updated_at,
            status=AIAuthoringProposalStatus.PENDING,
            proposal_kind=AIAuthoringProposalKind.CAPABILITY_BUNDLE,
            result_kind=AdminAIResultKind.MUTATION_PROPOSAL,
            action_schema_version=None,
            actions=None,
            capability_bundle_schema_version=validated.schema_version,
            capability_bundle=serialized,
            capability_bundle_hash=admin_ai_result_hash(validated),
            provider_name=provider_name,
            model_name=model_name,
            prompt_version=prompt_version,
            provider_schema_version=provider_schema_version,
            requested_by_user_id=requested_by_user_id,
            request_message_id=None,
            accepted_by_user_id=None, rejected_by_user_id=None,
            accepted_at=None, rejected_at=None,
        )
        try:
            self.db.add(proposal)
            self.db.commit()
            self.db.refresh(proposal)
            self.validate_hydrated_proposal(proposal)
            return proposal
        except Exception:
            self.db.rollback()
            raise

    def get_validated_bundle(self, *, proposal_id: uuid.UUID) -> tuple[AIAuthoringProposal, AdminAIResultEnvelope]:
        proposal = self.db.scalar(select(AIAuthoringProposal).where(
            AIAuthoringProposal.id == proposal_id,
            AIAuthoringProposal.deleted_at.is_(None),
        ))
        if proposal is None:
            raise AdminAIProposalPayloadNotFoundError("Capability proposal was not found.")
        return proposal, self.validate_hydrated_proposal(proposal)

    def validate_hydrated_proposal(self, proposal: AIAuthoringProposal) -> AdminAIResultEnvelope:
        if (
            proposal.proposal_kind != AIAuthoringProposalKind.CAPABILITY_BUNDLE
            or proposal.result_kind != AdminAIResultKind.MUTATION_PROPOSAL
            or proposal.capability_bundle_schema_version != 1
            or proposal.capability_bundle is None
            or proposal.capability_bundle_hash is None
        ):
            raise AdminAIProposalPayloadValidationError("Stored capability proposal metadata is inconsistent.")
        validated = self._validate_bundle(proposal.capability_bundle)
        if admin_ai_result_hash(validated) != proposal.capability_bundle_hash:
            raise AdminAIProposalPayloadTamperedError("Stored capability proposal fingerprint does not match.")
        return validated

    def validate_before_accept(self, proposal: AIAuthoringProposal) -> AdminAIResultEnvelope:
        return self.validate_hydrated_proposal(proposal)

    def _validate_bundle(self, value: AdminAIResultEnvelope | object) -> AdminAIResultEnvelope:
        try:
            envelope = AdminAIResultEnvelope.model_validate(value)
            return self.registry.validate_envelope(envelope)
        except (ValidationError, TypeError, ValueError) as exc:
            raise AdminAIProposalPayloadValidationError("Capability result bundle is invalid.") from exc

    @staticmethod
    def _validate_provenance(provider: str, model: str, prompt: str, schema_version: int) -> None:
        if any(not value.strip() or value != value.strip() for value in (provider, model, prompt)):
            raise AdminAIProposalPayloadValidationError("Provider provenance is invalid.")
        if type(schema_version) is not int or schema_version <= 0:
            raise AdminAIProposalPayloadValidationError("Provider schema version is invalid.")
