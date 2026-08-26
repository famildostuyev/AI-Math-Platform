from __future__ import annotations

import os, sys, unittest, uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"; os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.enums import AnswerPolicy, QuestionRevisionStatus
from app.models.answer_option import AnswerOption
from app.models.accepted_answer import AcceptedAnswer
from app.models.question_revision import QuestionRevision
from app.models.content_block import ContentBlock
from app.models.text_block_content import TextBlockContent
from app.core.enums import ContentBlockType
from app.services.ai_authoring_proposal_preview_service import AIAuthoringProposalPreviewService
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.authoring_assistant_provider import AuthoringAssistantInvalidActionTargetError
from app.services.openai_authoring_assistant_provider import (
    OpenAIAuthoringAssistantProvider, _OpenAIAuthoringEnvelope,
    _OpenAICreateAnswerOptionAction, _OpenAITextPayload,
    _OpenAIStructuredTextDocument, _OpenAIParagraphNode, _OpenAITextNode,
)
from app.services.question_authoring_context import (
    AuthoringAcceptedAnswerContext, AuthoringAnswerOptionContext,
    AuthoringRevisionContext, AuthoringSourceContext,
)
from app.services.question_editor_service import InvalidAuthoringActionTargetError, QuestionEditorService

NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)

def document(text="42"):
    return {"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": [{"type": "text", "text": text, "marks": []}]}]}

def payload(text="42"):
    return {"document": document(text), "format_version": 1}

def context(policy=AnswerPolicy.OPTION_SINGLE, options=(), accepted=()):
    return AuthoringRevisionContext(revision_id=uuid.uuid4(), revision_number=1,
        revision_status=QuestionRevisionStatus.DRAFT, revision_updated_at=NOW,
        provenance_kind="human_authored", question_family_id=uuid.uuid4(),
        question_form_id=uuid.uuid4(), question_type_id=uuid.uuid4(),
        primary_topic_id=None, related_topic_ids=(), purpose_ids=(), difficulty=None,
        source=AuthoringSourceContext(source_id=None, display_name=None, detail=None), blocks=(),
        answer_policy=policy, answer_options=options, accepted_answers=accepted)

def scalar_result(values):
    result = MagicMock(); result.all.return_value = values; return result

class AIAuthoringAnswerActionTest(unittest.TestCase):
    def test_context_preserves_order_content_and_correctness(self):
        first, second = uuid.uuid4(), uuid.uuid4()
        options = tuple(AuthoringAnswerOptionContext(option_id=item_id, label=label, order=order,
            source_text=text, document=document(text), format_version=1, is_correct=correct)
            for item_id, label, order, text, correct in ((first, "A", 1000, "One", False), (second, "B", 2000, "Two", True)))
        value = context(options=options)
        self.assertEqual([item.option_id for item in value.answer_options], [first, second])
        self.assertEqual([item.is_correct for item in value.answer_options], [False, True])

    def test_provider_maps_valid_answer_action_and_schema_is_strict(self):
        internal_payload = _OpenAITextPayload(document=_OpenAIStructuredTextDocument(type="document", content=[_OpenAIParagraphNode(type="paragraph", attrs=None, content=[_OpenAITextNode(type="text", text="One", marks=[])])]), format_version=1)
        parsed = _OpenAIAuthoringEnvelope(schema_version=1, actions=[_OpenAICreateAnswerOptionAction(action_type="create_answer_option", label="A", payload=internal_payload)])
        mapped = OpenAIAuthoringAssistantProvider._map_envelope(parsed)
        self.assertEqual(mapped.actions[0].action_type, "create_answer_option")
        schema = _OpenAIAuthoringEnvelope.model_json_schema()
        self.assertNotIn("discriminator", repr(schema)); self.assertNotIn("oneOf", repr(schema))

    def test_provider_rejects_wrong_policy_and_cross_revision_target(self):
        option_id = uuid.uuid4()
        create = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "create_answer_option", "label": "A", "payload": payload()}]})
        with self.assertRaises(AuthoringAssistantInvalidActionTargetError):
            OpenAIAuthoringAssistantProvider._validate_targets(envelope=create, context=context(AnswerPolicy.UNSUPPORTED))
        update = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "update_answer_option", "option_id": str(option_id), "label": "A", "payload": payload()}]})
        with self.assertRaises(AuthoringAssistantInvalidActionTargetError):
            OpenAIAuthoringAssistantProvider._validate_targets(envelope=update, context=context())

    def test_preview_projects_option_correctness_and_accepted_answer(self):
        option_id, answer_id, proposal_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        option = AuthoringAnswerOptionContext(option_id=option_id, label="A", order=1000, source_text="One", document=document("One"), format_version=1, is_correct=False)
        service = AIAuthoringProposalPreviewService(MagicMock())
        envelope = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "update_answer_option", "option_id": str(option_id), "label": "A", "payload": payload("Changed")}, {"action_type": "set_correct_answers", "option_ids": [str(option_id)]}]})
        changes = service._simulate(proposal_id=proposal_id, envelope=envelope, context=context(options=(option,)))
        self.assertEqual([item.action_type for item in changes], ["update_answer_option", "set_correct_answers"])
        accepted = AuthoringAcceptedAnswerContext(answer_id=answer_id, order=1000, source_text="42", document=document(), format_version=1)
        action = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "update_accepted_answer", "answer_id": str(answer_id), "payload": payload("43")}]})
        self.assertEqual(service._simulate(proposal_id=proposal_id, envelope=action, context=context(AnswerPolicy.ACCEPTED_ANSWER, accepted=(accepted,)))[0].after.source_text, "43")

    def test_correct_answer_preview_maps_before_c_to_after_b(self):
        option_ids = [uuid.uuid4() for _ in range(3)]
        options = tuple(AuthoringAnswerOptionContext(
            option_id=option_id, label=label, order=index * 1000,
            source_text=text, document=document(text), format_version=1,
            is_correct=label == "C",
        ) for index, (option_id, label, text) in enumerate(zip(
            option_ids, ("A", "B", "C"), ("2", "3", "4"), strict=True
        ), start=1))
        envelope = AuthoringActionEnvelope.model_validate({"actions": [{
            "action_type": "set_correct_answers",
            "option_ids": [str(option_ids[1])],
        }]})

        change = AIAuthoringProposalPreviewService(MagicMock())._simulate(
            proposal_id=uuid.uuid4(), envelope=envelope,
            context=context(options=options),
        )[0]

        self.assertEqual(
            [(item.label, item.source_text) for item in change.before.correct_options],
            [("C", "4")],
        )
        self.assertEqual(
            [(item.label, item.source_text) for item in change.after.correct_options],
            [("B", "3")],
        )

    def test_correct_answer_preview_preserves_multiple_option_order(self):
        option_ids = [uuid.uuid4() for _ in range(3)]
        options = tuple(AuthoringAnswerOptionContext(
            option_id=option_id, label=label, order=index * 1000,
            source_text=text, document=document(text), format_version=1,
            is_correct=False,
        ) for index, (option_id, label, text) in enumerate(zip(
            option_ids, ("A", "B", "C"), ("2", "3", "4"), strict=True
        ), start=1))
        envelope = AuthoringActionEnvelope.model_validate({"actions": [{
            "action_type": "set_correct_answers",
            "option_ids": [str(option_ids[2]), str(option_ids[0])],
        }]})

        change = AIAuthoringProposalPreviewService(MagicMock())._simulate(
            proposal_id=uuid.uuid4(), envelope=envelope,
            context=context(AnswerPolicy.OPTION_MULTIPLE, options=options),
        )[0]

        self.assertEqual(
            [item.label for item in change.after.correct_options],
            ["C", "A"],
        )

    def test_correct_answer_preview_uses_safe_missing_option_fallback(self):
        missing_id = uuid.uuid4()

        preview = AIAuthoringProposalPreviewService._correct_answer_preview(
            (missing_id,), {},
        )

        self.assertEqual(preview.correct_options[0].option_id, missing_id)
        self.assertIsNone(preview.correct_options[0].label)
        self.assertIsNone(preview.correct_options[0].source_text)

    def test_atomic_answer_application_has_no_internal_commit(self):
        option_id = uuid.uuid4(); revision = QuestionRevision(id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT, updated_at=NOW)
        revision.question_form = SimpleNamespace(question_type=SimpleNamespace(name="multiple_choice"))
        option = AnswerOption(id=option_id, revision_id=revision.id, label="A", order_index=1000, source_text="One", document_data=document("One"), format_version=1, is_correct=False)
        db = MagicMock(); db.scalars.side_effect = [scalar_result([option]), scalar_result([])]
        actions = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "update_answer_option", "option_id": str(option_id), "label": "B", "payload": payload("Two")}, {"action_type": "set_correct_answers", "option_ids": [str(option_id)]}]}).actions
        original = __import__('app.services.question_answer_service', fromlist=['AnswerPolicyService']).AnswerPolicyService.for_question_type_name
        from unittest.mock import patch
        with patch('app.services.question_editor_service.AnswerPolicyService.for_question_type_name', return_value=AnswerPolicy.OPTION_SINGLE):
            QuestionEditorService(db)._apply_answer_action_set(revision, actions, NOW)
        self.assertEqual(option.label, "B"); self.assertTrue(option.is_correct); db.commit.assert_not_called()

    def test_correct_option_must_be_cleared_before_delete(self):
        option_id = uuid.uuid4(); revision = QuestionRevision(id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT, updated_at=NOW)
        revision.question_form = SimpleNamespace(question_type=SimpleNamespace(name="multiple_choice"))
        option = AnswerOption(id=option_id, revision_id=revision.id, label="A", order_index=1000, source_text="One", document_data=document(), format_version=1, is_correct=True)
        db = MagicMock(); db.scalars.side_effect = [scalar_result([option]), scalar_result([])]
        invalid = AuthoringActionEnvelope.model_validate({"actions": [{"action_type": "delete_answer_option", "option_id": str(option_id)}]}).actions
        from unittest.mock import patch
        with patch('app.services.question_editor_service.AnswerPolicyService.for_question_type_name', return_value=AnswerPolicy.OPTION_SINGLE), self.assertRaises(InvalidAuthoringActionTargetError):
            QuestionEditorService(db)._apply_answer_action_set(revision, invalid, NOW)

    def test_mixed_block_and_answer_actions_share_one_uncommitted_transaction(self):
        option_id = uuid.uuid4(); revision = QuestionRevision(id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT, updated_at=NOW)
        revision.question_form = SimpleNamespace(question_type=SimpleNamespace(name="multiple_choice"))
        block = ContentBlock(id=uuid.uuid4(), question_revision_id=revision.id, block_type=ContentBlockType.TEXT, sort_order=1000)
        block.text_content = TextBlockContent(source_text="Before", document_data=document("Before"), format_version=1)
        option = AnswerOption(id=option_id, revision_id=revision.id, label="A", order_index=1000, source_text="One", document_data=document("One"), format_version=1, is_correct=False)
        db = MagicMock(); db.scalar.return_value = revision
        db.scalars.side_effect = [scalar_result([block]), scalar_result([option]), scalar_result([])]
        actions = AuthoringActionEnvelope.model_validate({"actions": [
            {"action_type": "update_text_block", "block_id": str(block.id), "payload": payload("After")},
            {"action_type": "update_answer_option", "option_id": str(option_id), "label": "B", "payload": payload("Two")},
        ]}).actions
        from unittest.mock import patch
        with patch('app.services.question_editor_service.AnswerPolicyService.for_question_type_name', return_value=AnswerPolicy.OPTION_SINGLE):
            QuestionEditorService(db).apply_action_set(revision_id=revision.id, expected_revision_updated_at=NOW, actions=actions)
        self.assertEqual(block.text_content.source_text, "After")
        self.assertEqual((option.label, option.source_text), ("B", "Two"))
        db.commit.assert_not_called()

if __name__ == "__main__": unittest.main()
