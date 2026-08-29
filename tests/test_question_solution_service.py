from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused")
os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-00000000000001")
os.environ.setdefault("REFRESH_TOKEN_HASH_KEY", "test-refresh-token-hash-key-000001")
os.environ.setdefault("VERIFICATION_CODE_HASH_KEY", "test-verification-code-hash-key-01")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.enums import QuestionRevisionStatus, SolutionBlockType
from app.models.solution import Solution
from app.models.solution_block import SolutionBlock
from app.schemas.question_solution import (
    SolutionBlockOrderRequest, SolutionFormulaBlockCreate, SolutionFormulaBlockUpdate,
    SolutionTextBlockCreate, SolutionTextBlockUpdate,
)
from app.services.question_solution_service import (
    QuestionSolutionService, SolutionAlreadyExistsError,
    SolutionBlockNotFoundError, SolutionBlockOrderSetMismatchError,
    SolutionBlockTypeMismatchError, SolutionRevisionConflictError,
    SolutionRevisionNotEditableError,
)
from app.services.authoring_action import AuthoringActionEnvelope

NOW = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)


def document(text: str = "Step") -> dict[str, object]:
    return {"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": [{"type": "text", "text": text, "marks": []}]}]}


def revision(status=QuestionRevisionStatus.DRAFT, updated_at=NOW):
    return SimpleNamespace(id=uuid.uuid4(), status=status, updated_at=updated_at)


def solution(revision_id):
    return Solution(id=uuid.uuid4(), question_revision_id=revision_id)


def block(solution_id, kind=SolutionBlockType.TEXT, order=1000):
    return SolutionBlock(
        id=uuid.uuid4(), solution_id=solution_id, block_type=kind,
        sort_order=order, source_text="Step" if kind == SolutionBlockType.TEXT else None,
        document_data=document() if kind == SolutionBlockType.TEXT else None,
        source_latex="x^2" if kind == SolutionBlockType.FORMULA else None,
        format_version=1,
    )


def rows(values):
    result = MagicMock()
    result.all.return_value = values
    return result


class QuestionSolutionServiceTest(unittest.TestCase):
    def test_authoring_create_solution_and_blocks_is_commit_free_atomic_primitive(self) -> None:
        db, rev = MagicMock(), revision()
        service = QuestionSolutionService(db)
        added = []
        db.add.side_effect = added.append
        def flush_ids():
            if added and getattr(added[-1], "id", None) is None:
                added[-1].id = uuid.uuid4()
        db.flush.side_effect = flush_ids
        actions = AuthoringActionEnvelope.model_validate({"actions": [
            {"action_type": "create_solution"},
            {"action_type": "create_solution_text_block", "payload": {"document": document("Step"), "format_version": 1}},
            {"action_type": "create_solution_formula_block", "payload": {"source_latex": "x=2", "format_version": 1}},
        ]}).actions
        with patch.object(service, "_solution_for_revision", side_effect=[None, None]):
            service.apply_authoring_actions(revision=rev, actions=actions, now=NOW)
        self.assertEqual([type(item) for item in added], [Solution, SolutionBlock, SolutionBlock])
        self.assertEqual(added[1].source_text, "Step")
        self.assertEqual(added[2].source_latex, "x=2")
        db.commit.assert_not_called()

    def test_authoring_invalid_sequence_mutates_nothing(self) -> None:
        db, rev = MagicMock(), revision()
        service = QuestionSolutionService(db)
        actions = AuthoringActionEnvelope.model_validate({"actions": [{
            "action_type": "create_solution_text_block",
            "payload": {"document": document("Step"), "format_version": 1},
        }]}).actions
        with patch.object(service, "_solution_for_revision", return_value=None), self.assertRaises(Exception):
            service.apply_authoring_actions(revision=rev, actions=actions, now=NOW)
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_schema_rejects_unknown_type_and_duplicate_reorder_ids(self) -> None:
        with self.assertRaises(ValidationError):
            SolutionTextBlockCreate.model_validate({
                "block_type": "image", "payload": {"document": document()},
                "expected_revision_updated_at": NOW,
            })
        repeated = uuid.uuid4()
        with self.assertRaises(ValidationError):
            SolutionBlockOrderRequest(block_ids=[repeated, repeated], expected_revision_updated_at=NOW)

    def test_create_solution_and_duplicate_guard(self) -> None:
        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, None]
        db.scalars.return_value = rows([])
        db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
        result = QuestionSolutionService(db).create_solution(
            revision_id=rev.id, expected_revision_updated_at=NOW
        )
        self.assertEqual(result.blocks, [])
        self.assertNotEqual(rev.updated_at, NOW)
        db.commit.assert_called_once()

        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, solution(rev.id)]
        with self.assertRaises(SolutionAlreadyExistsError):
            QuestionSolutionService(db).create_solution(
                revision_id=rev.id, expected_revision_updated_at=NOW
            )
        db.commit.assert_not_called()

    def test_soft_deleted_solution_is_not_seen_and_new_is_created(self) -> None:
        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, None]
        db.scalars.return_value = rows([])
        db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
        QuestionSolutionService(db).create_solution(
            revision_id=rev.id, expected_revision_updated_at=NOW
        )
        statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("solutions.deleted_at IS NULL", statement)
        db.add.assert_called_once()

    def test_create_and_update_text_and_formula_preserve_typed_payloads(self) -> None:
        for kind in (SolutionBlockType.TEXT, SolutionBlockType.FORMULA):
            with self.subTest(kind=kind):
                db, rev = MagicMock(), revision()
                item_solution = solution(rev.id)
                db.scalar.side_effect = [rev, item_solution, 0]
                db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
                service = QuestionSolutionService(db)
                if kind == SolutionBlockType.TEXT:
                    result = service.create_text_block(
                        revision_id=rev.id,
                        request=SolutionTextBlockCreate(block_type="text", payload={"document": document("First")}, expected_revision_updated_at=NOW),
                    )
                    self.assertEqual(result.source_text, "First")
                else:
                    result = service.create_formula_block(
                        revision_id=rev.id,
                        request=SolutionFormulaBlockCreate(block_type="formula", payload={"source_latex": "\\frac{1}{2}"}, expected_revision_updated_at=NOW),
                    )
                    self.assertEqual(result.source_latex, "\\frac{1}{2}")

        db, rev = MagicMock(), revision()
        item_solution, item = solution(rev.id), block(uuid.uuid4())
        item.solution_id = item_solution.id
        db.scalar.side_effect = [rev, item_solution, item]
        updated = QuestionSolutionService(db).update_text_block(
            revision_id=rev.id, block_id=item.id,
            request=SolutionTextBlockUpdate(payload={"document": document("Changed")}, expected_revision_updated_at=NOW),
        )
        self.assertEqual(updated.source_text, "Changed")

        db, rev = MagicMock(), revision()
        item_solution, item = solution(rev.id), block(uuid.uuid4(), SolutionBlockType.FORMULA)
        item.solution_id = item_solution.id
        db.scalar.side_effect = [rev, item_solution, item]
        updated = QuestionSolutionService(db).update_formula_block(
            revision_id=rev.id, block_id=item.id,
            request=SolutionFormulaBlockUpdate(payload={"source_latex": "y=2"}, expected_revision_updated_at=NOW),
        )
        self.assertEqual(updated.source_latex, "y=2")

    def test_create_and_read_round_trips_presentation_metadata_with_legacy_defaults(self) -> None:
        rev, item_solution = revision(), solution(uuid.uuid4())
        db = MagicMock()
        db.scalar.side_effect = [rev, item_solution, 0]
        db.add.side_effect = lambda item: setattr(item, "id", item.id or uuid.uuid4())
        created = QuestionSolutionService(db).create_formula_block(
            revision_id=rev.id,
            request=SolutionFormulaBlockCreate(
                block_type="formula", payload={"source_latex": r"k=\frac{y_2-y_1}{x_2-x_1}"},
                step_index=1, presentation_role="governing_formula",
                expected_revision_updated_at=NOW,
            ),
        )
        self.assertEqual((created.step_index, created.presentation_role.value), (1, "governing_formula"))
        added = db.add.call_args.args[0]
        self.assertEqual((added.step_index, added.presentation_role.value), (1, "governing_formula"))

        legacy = block(item_solution.id)
        legacy.step_index = None
        legacy.presentation_role = None
        projected = QuestionSolutionService._block_read(legacy)
        self.assertIsNone(projected.step_index)
        self.assertEqual(projected.presentation_role.value, "reasoning")

    def test_wrong_type_update_is_atomic(self) -> None:
        db, rev = MagicMock(), revision()
        item_solution = solution(rev.id)
        item = block(item_solution.id, SolutionBlockType.FORMULA)
        db.scalar.side_effect = [rev, item_solution, item]
        with self.assertRaises(SolutionBlockTypeMismatchError):
            QuestionSolutionService(db).update_text_block(
                revision_id=rev.id, block_id=item.id,
                request=SolutionTextBlockUpdate(payload={"document": document()}, expected_revision_updated_at=NOW),
            )
        db.commit.assert_not_called()
        self.assertEqual(item.source_latex, "x^2")

    def test_delete_block_and_solution_soft_delete_without_revision_delete(self) -> None:
        db, rev = MagicMock(), revision()
        item_solution = solution(rev.id)
        item = block(item_solution.id)
        db.scalar.side_effect = [rev, item_solution, item]
        QuestionSolutionService(db).delete_block(
            revision_id=rev.id, block_id=item.id, expected_revision_updated_at=NOW
        )
        self.assertIsNotNone(item.deleted_at)

        db, rev = MagicMock(), revision()
        rev.content_blocks = [object()]
        rev.answer_options = [object()]
        rev.accepted_answers = [object()]
        isolated_state = (
            list(rev.content_blocks), list(rev.answer_options),
            list(rev.accepted_answers),
        )
        item_solution = solution(rev.id)
        items = [block(item_solution.id), block(item_solution.id, SolutionBlockType.FORMULA, 2000)]
        db.scalar.side_effect = [rev, item_solution]
        db.scalars.return_value = rows(items)
        QuestionSolutionService(db).delete_solution(
            revision_id=rev.id, expected_revision_updated_at=NOW
        )
        self.assertIsNotNone(item_solution.deleted_at)
        self.assertTrue(all(item.deleted_at is not None for item in items))
        self.assertIsNone(getattr(rev, "deleted_at", None))
        self.assertEqual(
            (rev.content_blocks, rev.answer_options, rev.accepted_answers),
            isolated_state,
        )

    def test_reorder_requires_complete_local_active_set_and_preserves_payload(self) -> None:
        db, rev = MagicMock(), revision()
        item_solution = solution(rev.id)
        first, second = block(item_solution.id), block(item_solution.id, SolutionBlockType.FORMULA, 2000)
        db.scalar.side_effect = [rev, item_solution]
        db.scalars.return_value = rows([first, second])
        result = QuestionSolutionService(db).reorder_blocks(
            revision_id=rev.id,
            request=SolutionBlockOrderRequest(block_ids=[second.id, first.id], expected_revision_updated_at=NOW),
        )
        self.assertEqual([item.id for item in result], [second.id, first.id])
        self.assertEqual((second.source_latex, first.source_text), ("x^2", "Step"))

        for invalid_id in (uuid.uuid4(), first.id):
            db, rev = MagicMock(), revision()
            item_solution = solution(rev.id)
            active = [block(item_solution.id), block(item_solution.id, SolutionBlockType.FORMULA, 2000)]
            db.scalar.side_effect = [rev, item_solution]
            db.scalars.return_value = rows(active)
            requested = [active[0].id] if invalid_id == first.id else [active[0].id, invalid_id]
            with self.assertRaises(SolutionBlockOrderSetMismatchError):
                QuestionSolutionService(db).reorder_blocks(
                    revision_id=rev.id,
                    request=SolutionBlockOrderRequest(block_ids=requested, expected_revision_updated_at=NOW),
                )
            db.commit.assert_not_called()

    def test_foreign_or_soft_deleted_block_is_rejected(self) -> None:
        for found in (None,):
            db, rev = MagicMock(), revision()
            item_solution = solution(rev.id)
            db.scalar.side_effect = [rev, item_solution, found]
            with self.assertRaises(SolutionBlockNotFoundError):
                QuestionSolutionService(db).delete_block(
                    revision_id=rev.id, block_id=uuid.uuid4(), expected_revision_updated_at=NOW
                )
            statement = str(db.scalar.call_args_list[2].args[0])
            self.assertIn("solution_blocks.solution_id", statement)
            self.assertIn("solution_blocks.deleted_at IS NULL", statement)

    def test_draft_and_concurrency_guards_run_before_mutation(self) -> None:
        for rev, error in (
            (revision(QuestionRevisionStatus.APPROVED), SolutionRevisionNotEditableError),
            (revision(updated_at=NOW + timedelta(seconds=1)), SolutionRevisionConflictError),
        ):
            db = MagicMock()
            db.scalar.return_value = rev
            with self.assertRaises(error):
                QuestionSolutionService(db).create_solution(
                    revision_id=rev.id, expected_revision_updated_at=NOW
                )
            db.add.assert_not_called()
            db.commit.assert_not_called()

    def test_solution_creation_has_no_answer_dependency(self) -> None:
        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, None]
        db.scalars.return_value = rows([])
        db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
        QuestionSolutionService(db).create_solution(
            revision_id=rev.id, expected_revision_updated_at=NOW
        )
        statements = " ".join(str(call.args[0]) for call in db.scalar.call_args_list)
        self.assertNotIn("answer_options", statements)
        self.assertNotIn("accepted_answers", statements)


if __name__ == "__main__":
    unittest.main()
