from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin_ai import (
    get_admin_ai_catalog_service,
    get_admin_ai_current_revision_service,
    get_admin_ai_generated_question_draft_service,
    get_admin_ai_read_executor,
    get_admin_ai_similar_question_generator,
    router,
)
from app.api.deps import get_current_active_user
from app.core.enums import AdminAIGeneratedQuestionDraftStatus, RoleName
from app.database.session import get_db
from app.models.admin_ai_generated_question_draft import AdminAIGeneratedQuestionDraft
from app.models.question_revision import QuestionRevision
from app.models.solution_block import SolutionBlock
from app.models.user import User
from app.services.admin_ai_generated_question_draft_service import (
    AdminAIGeneratedQuestionDraftService,
)
from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft
from app.services.authoring_action import (
    CreateSolutionAction,
    CreateSolutionFormulaBlockAction,
    CreateSolutionTextBlockAction,
)
from app.services.admin_ai_result import AdminAICapabilityResult
from app.services.admin_ai_similar_question_service import (
    AdminAISimilarQuestionCandidate,
    AdminAISimilarQuestionProviderResponse,
)
from app.services.question_solution_service import QuestionSolutionService
from app.services.openai_admin_ai_planner import (
    OPENAI_ADMIN_AI_SIMILAR_QUESTION_INSTRUCTIONS,
    OpenAIAdminAIPlannerTimeoutError,
)


CONSTRAINTS = "bucaq əmsalı da n-dən asılı olsun"


def question_draft(index: int) -> AdminAIGeneratedDraft:
    return AdminAIGeneratedDraft.model_validate({
        "draft_kind": "question", "format_hint": "free_form",
        "title": f"Variant {index}",
        "content": {"format_version": 1, "segments": [
            {"type": "text", "text": f"Variant {index}: bucaq əmsalı n-dən asılıdır."},
            {"type": "math", "latex": f"y=n x+{index}", "source_text": f"y=n x+{index}", "display_mode": True},
        ]},
        "answer_options": [], "correct_option_labels": [],
        "explanation": {"format_version": 1, "segments": [
            {"type": "text", "text": f"1) Variant {index} üçün əmsalı müəyyən edək.", "step_index": 1, "presentation_role": "reasoning"},
            {"type": "math", "latex": f"m=n+{index}", "source_text": f"m equals n plus {index}", "display_mode": True, "step_index": 1, "presentation_role": "governing_formula"},
            {"type": "text", "text": "2) Alınmış əmsalı yerinə yazaq və cavabı yoxlayaq.", "step_index": 2, "presentation_role": "reasoning"},
            {"type": "math", "latex": f"y=(n+{index})x+{index}", "source_text": "final linear equation", "display_mode": True, "step_index": 2, "presentation_role": "final_answer"},
        ]},
        "is_canonical": False,
    })


def provider_response(count: int) -> AdminAISimilarQuestionProviderResponse:
    return AdminAISimilarQuestionProviderResponse(
        schema_version=1,
        candidates=tuple(AdminAISimilarQuestionCandidate(
            generated_draft=question_draft(index),
            applied_admin_constraints=CONSTRAINTS,
        ) for index in range(1, count + 1)),
    )


class SimilarQuestionGenerationAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.user = SimpleNamespace(id=uuid.uuid4(), last_active_role_id=uuid.uuid4())
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.source_revision_id = uuid.uuid4()
        self.question_type_id = uuid.uuid4()
        self.current = MagicMock()
        self.current.resolve.return_value = SimpleNamespace(
            revision_id=self.source_revision_id, question_type_id=self.question_type_id,
        )
        self.catalog = MagicMock()
        self.catalog.build.return_value = SimpleNamespace(question_types=(
            SimpleNamespace(id=self.question_type_id, name="open_response"),
        ))
        inspect = AdminAICapabilityResult(
            capability_name="admin_ai.inspect_current_question", capability_version=1,
            classification="read_only", effect_scope="none",
            payload={"revision_id": str(self.source_revision_id), "blocks": []},
        )
        self.reader = MagicMock()
        self.reader.hydrate_question_revision_host_context.return_value = SimpleNamespace(
            capability_results=(inspect,),
        )
        self.generator = MagicMock()
        self.drafts = MagicMock()

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_current_active_user] = lambda: self.user
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_admin_ai_current_revision_service] = lambda: self.current
        app.dependency_overrides[get_admin_ai_catalog_service] = lambda: self.catalog
        app.dependency_overrides[get_admin_ai_read_executor] = lambda: self.reader
        app.dependency_overrides[get_admin_ai_similar_question_generator] = lambda: self.generator
        app.dependency_overrides[get_admin_ai_generated_question_draft_service] = lambda: self.drafts
        self.client = TestClient(app)

    def request(self, count: int):
        return self.client.post("/api/v1/admin-ai/similar-question-drafts", json={
            "source_revision_id": str(self.source_revision_id),
            "requested_count": count,
            "admin_constraints": CONSTRAINTS,
        })

    def test_provider_timeout_remains_gateway_timeout_without_persistence(self) -> None:
        self.generator.generate_similar_questions.side_effect = (
            OpenAIAdminAIPlannerTimeoutError("provider detail")
        )
        response = self.request(1)
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json()["detail"], "Similar-question generation timed out.")
        self.drafts.create_many_from_generated_drafts.assert_not_called()

    def configure_success(self, count: int) -> list[AdminAIGeneratedQuestionDraft]:
        generated = provider_response(count)
        self.generator.generate_similar_questions.return_value = generated
        records = [AdminAIGeneratedQuestionDraft(
            id=uuid.uuid4(), owner_user_id=self.user.id,
            source_revision_id=self.source_revision_id,
            status=AdminAIGeneratedQuestionDraftStatus.ACTIVE,
            draft_kind=item.generated_draft.draft_kind,
            format_hint=item.generated_draft.format_hint,
            title=item.generated_draft.title,
            content=item.generated_draft.content.model_dump(mode="json"),
            answer_options=[], correct_option_labels=[],
            explanation=item.generated_draft.explanation.model_dump(mode="json"),
            is_canonical=False,
        ) for item in generated.candidates]
        self.drafts.create_many_from_generated_drafts.return_value = tuple(records)
        return records

    def test_requested_count_one_is_grounded_persisted_and_returned(self) -> None:
        records = self.configure_success(1)
        with patch(
            "app.services.question_editor_service.QuestionEditorService.create_draft"
        ) as canonical_create, patch(
            "app.services.admin_ai_mutation_proposal_service.AdminAIMutationProposalService.create_from_generated_draft"
        ) as proposal_create:
            response = self.request(1)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["requested_count"], 1)
        self.assertEqual(response.json()["items"][0]["persistent_draft_id"], str(records[0].id))
        self.assertEqual(response.json()["items"][0]["persistent_draft_status"], "active")
        self.assertFalse(response.json()["items"][0]["generated_draft"]["is_canonical"])
        explanation = response.json()["items"][0]["generated_draft"]["explanation"]["segments"]
        self.assertEqual(
            [(segment["step_index"], segment["presentation_role"]) for segment in explanation],
            [(1, "reasoning"), (1, "governing_formula"), (2, "reasoning"), (2, "final_answer")],
        )
        generation_call = self.generator.generate_similar_questions.call_args.kwargs
        self.assertEqual(generation_call["requested_count"], 1)
        self.assertEqual(generation_call["admin_constraints"], CONSTRAINTS)
        self.assertEqual(generation_call["source_context"].revision_id, self.source_revision_id)
        persistence_call = self.drafts.create_many_from_generated_drafts.call_args.kwargs
        self.assertEqual(persistence_call["owner_user_id"], self.user.id)
        self.assertEqual(persistence_call["source_revision_id"], self.source_revision_id)
        self.assertEqual(persistence_call["actor_role"], RoleName.ADMIN)
        self.drafts.promote_to_new_question.assert_not_called()
        canonical_create.assert_not_called()
        proposal_create.assert_not_called()

    def test_three_distinct_drafts_preserve_requested_order(self) -> None:
        records = self.configure_success(3)
        response = self.request(3)
        self.assertEqual(response.status_code, 201)
        items = response.json()["items"]
        self.assertEqual([item["generated_draft"]["title"] for item in items], [
            "Variant 1", "Variant 2", "Variant 3",
        ])
        ids = [item["persistent_draft_id"] for item in items]
        self.assertEqual(ids, [str(record.id) for record in records])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(not item["generated_draft"]["is_canonical"] for item in items))
        self.assertEqual(self.generator.generate_similar_questions.call_count, 1)
        self.assertEqual(self.drafts.create_many_from_generated_drafts.call_count, 1)

    def test_structured_solution_survives_provider_storage_reconstruction_and_promotion_mapping(self) -> None:
        draft = provider_response(1).candidates[0].generated_draft
        self.assertIsNotNone(draft.explanation)
        self.assertEqual([segment.type for segment in draft.explanation.segments], [
            "text", "math", "text", "math",
        ])
        owner_id, source_id = uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.scalar.side_effect = [User(id=owner_id, is_active=True), QuestionRevision(id=source_id)]
        record = AdminAIGeneratedQuestionDraftService(db).create_many_from_generated_drafts(
            drafts=(draft,), owner_user_id=owner_id, actor_role=RoleName.ADMIN,
            source_revision_id=source_id,
        )[0]
        self.assertEqual(record.explanation, draft.explanation.model_dump(mode="json"))
        reconstructed = AdminAIGeneratedQuestionDraftService.reconstruct_generated_draft(record)
        self.assertEqual(reconstructed.explanation, draft.explanation)

        solution_actions = [action for action in
            AdminAIGeneratedQuestionDraftService._promotion_actions(reconstructed)
            if isinstance(action, (
                CreateSolutionAction,
                CreateSolutionTextBlockAction,
                CreateSolutionFormulaBlockAction,
            ))
        ]
        self.assertEqual([type(action) for action in solution_actions], [
            CreateSolutionAction,
            CreateSolutionTextBlockAction,
            CreateSolutionFormulaBlockAction,
            CreateSolutionTextBlockAction,
            CreateSolutionFormulaBlockAction,
        ])
        formulas = [action.payload.source_latex for action in solution_actions
                    if isinstance(action, CreateSolutionFormulaBlockAction)]
        self.assertEqual(formulas, ["m=n+1", "y=(n+1)x+1"])
        self.assertEqual(
            [(action.step_index, action.presentation_role.value) for action in solution_actions[1:]],
            [(1, "reasoning"), (1, "governing_formula"), (2, "reasoning"), (2, "final_answer")],
        )
        text_documents = [action.payload.document.model_dump(mode="json") for action in solution_actions
                          if isinstance(action, CreateSolutionTextBlockAction)]
        self.assertNotIn("\\", str(text_documents))

        canonical_db = MagicMock()
        canonical_db.scalar.return_value = None
        QuestionSolutionService(canonical_db).apply_authoring_actions(
            revision=QuestionRevision(id=uuid.uuid4()),
            actions=solution_actions,
            now=datetime.now(timezone.utc),
        )
        canonical_blocks = [call.args[0] for call in canonical_db.add.call_args_list
                            if isinstance(call.args[0], SolutionBlock)]
        self.assertEqual([block.block_type.value for block in canonical_blocks], [
            "text", "formula", "text", "formula",
        ])
        self.assertEqual(
            [block.source_latex for block in canonical_blocks if block.source_latex is not None],
            ["m=n+1", "y=(n+1)x+1"],
        )

    def test_similar_candidate_rejects_missing_solution_and_raw_latex_prose(self) -> None:
        missing = question_draft(1).model_dump(mode="json")
        missing["explanation"] = None
        with self.assertRaises(ValueError):
            AdminAISimilarQuestionCandidate(
                generated_draft=AdminAIGeneratedDraft.model_validate(missing),
                applied_admin_constraints=CONSTRAINTS,
            )
        raw = question_draft(1).model_dump(mode="json")
        raw["explanation"]["segments"] = [{"type": "text", "text": r"x=\\frac{1}{2}"}]
        with self.assertRaises(ValueError):
            AdminAIGeneratedDraft.model_validate(raw)

    def test_new_provider_candidate_rejects_missing_or_null_semantic_metadata(self) -> None:
        for semantic_override in (
            {},
            {"step_index": None, "presentation_role": None},
        ):
            with self.subTest(semantic_override=semantic_override):
                draft_data = question_draft(1).model_dump(mode="json")
                draft_data["explanation"]["segments"] = [
                    {"type": "text", "text": "Working", **semantic_override},
                ]
                with self.assertRaises(ValueError):
                    AdminAISimilarQuestionCandidate(
                        generated_draft=AdminAIGeneratedDraft.model_validate(draft_data),
                        applied_admin_constraints=CONSTRAINTS,
                    )

    def test_provider_instructions_require_governing_rule_before_substitution(self) -> None:
        instructions = OPENAI_ADMIN_AI_SIMILAR_QUESTION_INSTRUCTIONS
        self.assertIn(
            "standard mathematical formula, identity, theorem, property, or rule",
            instructions,
        )
        self.assertIn("before substituting problem-specific values", instructions)
        self.assertIn("when pedagogically appropriate", instructions)
        self.assertIn("Do not force a governing formula", instructions)
        self.assertIn("step_index", instructions)
        self.assertIn("presentation_role", instructions)
        self.assertIn("share the same sequential step_index", instructions)
        self.assertIn("final_answer", instructions)
        self.assertIn("presentation_role must never be null", instructions)
        self.assertIn("at least one positive step_index", instructions)

    def test_structured_solution_orders_governing_formula_before_substitution(self) -> None:
        candidate_data = question_draft(1).model_dump(mode="json")
        candidate_data["explanation"]["segments"] = [
            {
                "type": "text",
                "text": "İki nöqtə üçün əvvəlcə uyğun ümumi düsturu yazaq.",
                "step_index": 1,
                "presentation_role": "reasoning",
            },
            {
                "type": "math",
                "latex": r"k=\frac{y_2-y_1}{x_2-x_1}",
                "source_text": "the general slope formula",
                "display_mode": True,
                "step_index": 1,
                "presentation_role": "governing_formula",
            },
            {
                "type": "text",
                "text": "İndi məsələdə verilən qiymətləri düsturda yerinə yazaq.",
                "step_index": 1,
                "presentation_role": "reasoning",
            },
            {
                "type": "math",
                "latex": r"\frac{10-n}{2n+1}=n+2",
                "source_text": "problem values substituted into the formula",
                "display_mode": True,
                "step_index": 1,
                "presentation_role": "result",
            },
        ]
        candidate = AdminAISimilarQuestionCandidate(
            generated_draft=AdminAIGeneratedDraft.model_validate(candidate_data),
            applied_admin_constraints=CONSTRAINTS,
        )

        segments = candidate.generated_draft.explanation.segments
        self.assertEqual([segment.type for segment in segments], [
            "text", "math", "text", "math",
        ])
        self.assertEqual(segments[1].latex, r"k=\frac{y_2-y_1}{x_2-x_1}")
        self.assertEqual(segments[3].latex, r"\frac{10-n}{2n+1}=n+2")

    def test_zero_and_above_technical_maximum_are_rejected_before_generation(self) -> None:
        self.assertEqual((self.request(0).status_code, self.request(21).status_code), (422, 422))
        self.generator.generate_similar_questions.assert_not_called()
        self.drafts.create_many_from_generated_drafts.assert_not_called()

    def test_duplicate_or_constraint_unacknowledged_candidates_fail_without_persistence(self) -> None:
        duplicate = question_draft(1)
        self.generator.generate_similar_questions.return_value = {
            "schema_version": 1,
            "candidates": [
                {"generated_draft": duplicate.model_dump(mode="json"), "applied_admin_constraints": CONSTRAINTS},
                {"generated_draft": duplicate.model_dump(mode="json"), "applied_admin_constraints": CONSTRAINTS},
            ],
        }
        duplicate_response = self.request(2)
        self.assertEqual(duplicate_response.status_code, 502)
        self.drafts.create_many_from_generated_drafts.assert_not_called()

        self.generator.generate_similar_questions.return_value = {
            "schema_version": 1,
            "candidates": [{
                "generated_draft": question_draft(1).model_dump(mode="json"),
                "applied_admin_constraints": "different constraints",
            }],
        }
        mismatch_response = self.request(1)
        self.assertEqual(mismatch_response.status_code, 502)
        self.drafts.create_many_from_generated_drafts.assert_not_called()


class SimilarQuestionBatchPersistenceTest(unittest.TestCase):
    def test_batch_is_atomic_and_preserves_owner_source_and_unique_ids(self) -> None:
        owner_id, source_id = uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.scalar.side_effect = [User(id=owner_id, is_active=True), QuestionRevision(id=source_id)]
        records = AdminAIGeneratedQuestionDraftService(db).create_many_from_generated_drafts(
            drafts=tuple(question_draft(index) for index in range(1, 4)),
            owner_user_id=owner_id, actor_role=RoleName.ADMIN, source_revision_id=source_id,
        )
        self.assertEqual(len({record.id for record in records}), 3)
        self.assertTrue(all(record.owner_user_id == owner_id for record in records))
        self.assertTrue(all(record.source_revision_id == source_id for record in records))
        self.assertTrue(all(record.status == AdminAIGeneratedQuestionDraftStatus.ACTIVE for record in records))
        self.assertTrue(all(not record.is_canonical for record in records))
        self.assertEqual(
            [record.explanation for record in records],
            [question_draft(index).explanation.model_dump(mode="json") for index in range(1, 4)],
        )
        db.add_all.assert_called_once_with(records)
        db.commit.assert_called_once()

    def test_batch_failure_rolls_back_all_candidates(self) -> None:
        owner_id, source_id = uuid.uuid4(), uuid.uuid4()
        db = MagicMock()
        db.scalar.side_effect = [User(id=owner_id, is_active=True), QuestionRevision(id=source_id)]
        db.flush.side_effect = RuntimeError("insert failed")
        with self.assertRaises(RuntimeError):
            AdminAIGeneratedQuestionDraftService(db).create_many_from_generated_drafts(
                drafts=(question_draft(1), question_draft(2)), owner_user_id=owner_id,
                actor_role=RoleName.ADMIN, source_revision_id=source_id,
            )
        db.commit.assert_not_called()
        db.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
