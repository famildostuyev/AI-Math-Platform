from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.admin_ai_planner_grounding import (
    ADMIN_AI_MAX_GROUNDED_QUESTION_TYPES,
    AdminAIPlannerCatalogGroundingLimitError,
    AdminAIPlannerCatalogService,
    AdminAIPlannerCurrentRevisionGroundingError,
    AdminAIPlannerCurrentRevisionService,
)


def question_type(*, name: str, active: bool = True):
    return SimpleNamespace(
        id=uuid.uuid4(), name=name, display_name=name.replace("_", " ").title(),
        sort_order=1, is_active=active, deleted_at=None,
    )


class AdminAIPlannerCatalogGroundingTest(unittest.TestCase):
    def test_projects_bounded_deterministic_safe_question_type_data(self) -> None:
        multiple_choice = question_type(name="multiple_choice")
        open_response = question_type(name="open_response")
        db = MagicMock()
        db.scalars.return_value.all.return_value = [multiple_choice, open_response]

        first = AdminAIPlannerCatalogService(db).build()
        second = AdminAIPlannerCatalogService(db).build()

        self.assertEqual(first, second)
        self.assertEqual(
            [entry.id for entry in first.question_types],
            [multiple_choice.id, open_response.id],
        )
        serialized = first.model_dump(mode="json")
        self.assertEqual(set(serialized["question_types"][0]), {"id", "name", "display_name"})
        self.assertNotIn("orm", repr(serialized).casefold())
        self.assertNotIn("sql", repr(serialized).casefold())
        self.assertNotIn("secret", repr(serialized).casefold())

    def test_entry_limit_fails_closed_without_truncation(self) -> None:
        db = MagicMock()
        db.scalars.return_value.all.return_value = [
            question_type(name=f"type_{index}")
            for index in range(ADMIN_AI_MAX_GROUNDED_QUESTION_TYPES + 1)
        ]
        with self.assertRaises(AdminAIPlannerCatalogGroundingLimitError):
            AdminAIPlannerCatalogService(db).build()

    def test_current_revision_projection_contains_only_active_identity_pair(self) -> None:
        revision_id = uuid.uuid4()
        question_type_id = uuid.uuid4()
        db = MagicMock()
        db.execute.return_value.one_or_none.return_value = (revision_id, question_type_id)
        result = AdminAIPlannerCurrentRevisionService(db).resolve(revision_id=revision_id)
        self.assertEqual(result.revision_id, revision_id)
        self.assertEqual(result.question_type_id, question_type_id)
        self.assertEqual(set(result.model_dump()), {"revision_id", "question_type_id"})

    def test_missing_inactive_or_deleted_current_revision_fails_closed(self) -> None:
        db = MagicMock()
        db.execute.return_value.one_or_none.return_value = None
        with self.assertRaises(AdminAIPlannerCurrentRevisionGroundingError):
            AdminAIPlannerCurrentRevisionService(db).resolve(revision_id=uuid.uuid4())


if __name__ == "__main__":
    unittest.main()
