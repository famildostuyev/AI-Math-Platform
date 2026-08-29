from __future__ import annotations

import uuid
from datetime import datetime

from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft, AdminAIHostContext
from app.services.ai_authoring_proposal_service import AIAuthoringProposalService
from app.services.authoring_action import AuthoringActionEnvelope


class AdminAIMutationProposalError(Exception):
    pass


class AdminAIMutationProposalService:
    def __init__(
        self, db, *, provider_name: str, model_name: str,
        prompt_version: str, provider_schema_version: int,
    ) -> None:
        self.db = db
        self.provider_name = provider_name
        self.model_name = model_name
        self.prompt_version = prompt_version
        self.provider_schema_version = provider_schema_version

    def create_from_generated_draft(
        self, *, host_context: AdminAIHostContext, draft: AdminAIGeneratedDraft,
        requested_by_user_id: uuid.UUID,
    ):
        payload = host_context.inspect_result.payload
        if draft.format_hint == "multiple_choice" and payload.get("answer_policy") not in {
            "option_single", "option_multiple",
        }:
            raise AdminAIMutationProposalError("Draft format does not match the canonical answer policy.")
        if draft.format_hint == "free_form" and payload.get("answer_policy") in {
            "option_single", "option_multiple",
        }:
            raise AdminAIMutationProposalError("Draft format does not match the canonical answer policy.")

        actions: list[dict[str, object]] = []
        existing_options = list(payload.get("answer_options") or [])
        if existing_options:
            actions.append({"action_type": "set_correct_answers", "option_ids": []})
            actions.extend({
                "action_type": "delete_answer_option", "option_id": option["option_id"],
            } for option in existing_options)
        existing_answers = list(payload.get("accepted_answers") or [])
        actions.extend({
            "action_type": "delete_accepted_answer", "answer_id": answer["answer_id"],
        } for answer in existing_answers)
        if payload.get("solution") is not None:
            actions.append({"action_type": "delete_solution"})
        actions.extend({
            "action_type": "delete_block", "block_id": block["block_id"],
        } for block in payload.get("blocks") or [])

        for segment in draft.content.segments:
            if segment.type == "text":
                actions.append({
                    "action_type": "create_text_block",
                    "payload": {"document": self._document(segment.text), "format_version": 1},
                })
            else:
                actions.append({
                    "action_type": "create_formula_block",
                    "payload": {"source_latex": segment.latex, "format_version": 1},
                })

        option_ids: dict[str, uuid.UUID] = {}
        for option in draft.answer_options:
            option_id = uuid.uuid4()
            option_ids[option.label] = option_id
            actions.append({
                "action_type": "create_answer_option", "option_id": option_id,
                "label": option.label,
                "payload": {"document": self._document(option.text), "format_version": 1},
            })
        if draft.correct_option_labels:
            actions.append({
                "action_type": "set_correct_answers",
                "option_ids": [option_ids[label] for label in draft.correct_option_labels],
            })

        envelope = AuthoringActionEnvelope.model_validate({"schema_version": 1, "actions": actions})
        updated_at = datetime.fromisoformat(str(payload["revision_updated_at"]))
        return AIAuthoringProposalService(self.db).create_pending_proposal(
            source_revision_id=host_context.revision_id,
            expected_revision_updated_at=updated_at,
            action_envelope=envelope,
            provider_name=self.provider_name, model_name=self.model_name,
            prompt_version=self.prompt_version,
            provider_schema_version=self.provider_schema_version,
            requested_by_user_id=requested_by_user_id,
        )

    @staticmethod
    def _document(text: str) -> dict[str, object]:
        return {"type": "document", "content": [{
            "type": "paragraph", "content": [{"type": "text", "text": text}],
        }]}
