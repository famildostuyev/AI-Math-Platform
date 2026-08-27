from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.authoring_action import (
    AuthoringActionEnvelope,
    CreateFormulaBlockAction,
    CreateTextBlockAction,
    DeleteBlockAction,
    ReorderBlockAction,
    UpdateFormulaBlockAction,
    UpdateTextBlockAction,
    CreateAnswerOptionAction,
    UpdateAnswerOptionAction,
    DeleteAnswerOptionAction,
    ReorderAnswerOptionsAction,
    SetCorrectAnswersAction,
    CreateAcceptedAnswerAction,
    UpdateAcceptedAnswerAction,
    DeleteAcceptedAnswerAction,
    ReorderAcceptedAnswersAction,
    CreateSolutionAction, DeleteSolutionAction,
    CreateSolutionTextBlockAction, UpdateSolutionTextBlockAction,
    CreateSolutionFormulaBlockAction, UpdateSolutionFormulaBlockAction,
    DeleteSolutionBlockAction, ReorderSolutionBlocksAction,
)


def text_payload(text: str = "Draft") -> dict[str, object]:
    return {
        "document": {
            "type": "document",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }],
        },
        "format_version": 1,
    }


class AuthoringActionContractTest(unittest.TestCase):
    def test_solution_actions_are_strict_typed_and_ordered(self) -> None:
        block_id = uuid.uuid4()
        envelope = AuthoringActionEnvelope.model_validate({"actions": [
            {"action_type": "create_solution"},
            {"action_type": "create_solution_text_block", "payload": text_payload("Step")},
            {"action_type": "create_solution_formula_block", "payload": {"source_latex": "x=2", "format_version": 1}},
            {"action_type": "update_solution_text_block", "solution_block_id": str(block_id), "payload": text_payload("Updated")},
            {"action_type": "update_solution_formula_block", "solution_block_id": str(block_id), "payload": {"source_latex": "x=3", "format_version": 1}},
            {"action_type": "delete_solution_block", "solution_block_id": str(block_id)},
            {"action_type": "reorder_solution_blocks", "ordered_solution_block_ids": [str(block_id)]},
            {"action_type": "delete_solution"},
        ]})
        self.assertEqual([type(action) for action in envelope.actions], [
            CreateSolutionAction, CreateSolutionTextBlockAction,
            CreateSolutionFormulaBlockAction, UpdateSolutionTextBlockAction,
            UpdateSolutionFormulaBlockAction, DeleteSolutionBlockAction,
            ReorderSolutionBlocksAction, DeleteSolutionAction,
        ])

    def test_solution_actions_reject_unknown_fields_and_duplicate_order(self) -> None:
        block_id = uuid.uuid4()
        for value in (
            {"actions": [{"action_type": "create_solution", "solution_id": str(uuid.uuid4())}]},
            {"actions": [{"action_type": "reorder_solution_blocks", "ordered_solution_block_ids": [str(block_id), str(block_id)]}]},
            {"actions": [{"action_type": "create_solution_formula_block", "payload": {"source_latex": " ", "format_version": 1}}]},
        ):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AuthoringActionEnvelope.model_validate(value)

    def test_answer_actions_are_strict_typed_and_ordered(self) -> None:
        option_id, answer_id = uuid.uuid4(), uuid.uuid4()
        envelope = AuthoringActionEnvelope.model_validate({"schema_version": 1, "actions": [
            {"action_type": "create_answer_option", "label": "A", "payload": text_payload("One")},
            {"action_type": "update_answer_option", "option_id": str(option_id), "label": "B", "payload": text_payload("Two")},
            {"action_type": "delete_answer_option", "option_id": str(option_id)},
            {"action_type": "reorder_answer_options", "ordered_option_ids": [str(option_id)]},
            {"action_type": "set_correct_answers", "option_ids": [str(option_id)]},
            {"action_type": "create_accepted_answer", "payload": text_payload("42")},
            {"action_type": "update_accepted_answer", "answer_id": str(answer_id), "payload": text_payload("43")},
            {"action_type": "delete_accepted_answer", "answer_id": str(answer_id)},
            {"action_type": "reorder_accepted_answers", "ordered_answer_ids": [str(answer_id)]},
        ]})
        self.assertEqual([type(action) for action in envelope.actions], [
            CreateAnswerOptionAction, UpdateAnswerOptionAction,
            DeleteAnswerOptionAction, ReorderAnswerOptionsAction,
            SetCorrectAnswersAction, CreateAcceptedAnswerAction,
            UpdateAcceptedAnswerAction, DeleteAcceptedAnswerAction,
            ReorderAcceptedAnswersAction,
        ])

    def test_answer_actions_reject_unknown_fields_and_invalid_content(self) -> None:
        with self.assertRaises(ValidationError):
            AuthoringActionEnvelope.model_validate({"actions": [{
                "action_type": "create_answer_option", "label": "A",
                "payload": text_payload(), "is_correct": True,
            }]})
        with self.assertRaises(ValidationError):
            AuthoringActionEnvelope.model_validate({"actions": [{
                "action_type": "create_accepted_answer",
                "payload": {"document": {"type": "invalid", "content": []}, "format_version": 1},
            }]})
    def test_update_actions_use_existing_editor_payload_shapes(self) -> None:
        text = AuthoringActionEnvelope.model_validate({
            "schema_version": 1,
            "actions": [{
                "action_type": "update_text_block",
                "block_id": str(uuid.uuid4()),
                "payload": text_payload(),
            }],
        })
        formula = AuthoringActionEnvelope.model_validate({
            "schema_version": 1,
            "actions": [{
                "action_type": "update_formula_block",
                "block_id": str(uuid.uuid4()),
                "payload": {"source_latex": r"\frac{1}{2}", "format_version": 1},
            }],
        })
        self.assertIsInstance(text.actions[0], UpdateTextBlockAction)
        self.assertIsInstance(formula.actions[0], UpdateFormulaBlockAction)

    def test_create_delete_and_reorder_actions_are_typed_and_ordered(self) -> None:
        first_id, second_id = uuid.uuid4(), uuid.uuid4()
        envelope = AuthoringActionEnvelope.model_validate({
            "schema_version": 1,
            "actions": [
                {"action_type": "create_text_block", "payload": text_payload()},
                {"action_type": "create_formula_block", "payload": {
                    "source_latex": "x=1", "format_version": 1,
                }},
                {"action_type": "delete_block", "block_id": str(first_id)},
                {"action_type": "reorder_blocks", "ordered_block_ids": [
                    str(second_id), str(first_id),
                ]},
            ],
        })
        self.assertEqual(
            [type(action) for action in envelope.actions],
            [
                CreateTextBlockAction,
                CreateFormulaBlockAction,
                DeleteBlockAction,
                ReorderBlockAction,
            ],
        )
        self.assertEqual(
            envelope.actions[-1].ordered_block_ids,
            [second_id, first_id],
        )

    def test_invalid_union_empty_list_duplicates_and_unknown_fields_reject(self) -> None:
        invalid_values = (
            {"schema_version": 1, "actions": []},
            {"schema_version": 1, "actions": [{"action_type": "unknown"}]},
            {"schema_version": 1, "actions": [{
                "action_type": "delete_block",
                "block_id": str(uuid.uuid4()),
                "credential": "secret",
            }]},
            {"schema_version": 1, "actions": [{
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(value := uuid.uuid4()), str(value)],
            }]},
            {"schema_version": 1, "actions": [{
                "action_type": "create_formula_block",
                "payload": {"source_latex": "   ", "format_version": 1},
            }]},
        )
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AuthoringActionEnvelope.model_validate(value)

    def test_serialization_contains_only_provider_neutral_fields(self) -> None:
        envelope = AuthoringActionEnvelope.model_validate({
            "actions": [{
                "action_type": "create_formula_block",
                "payload": {"source_latex": "x^2", "format_version": 1},
            }],
        })
        serialized = envelope.model_dump(mode="json")
        self.assertEqual(set(serialized), {"schema_version", "actions"})
        self.assertNotIn("raw_response", repr(serialized))
        self.assertNotIn("api_key", repr(serialized))


if __name__ == "__main__":
    unittest.main()
