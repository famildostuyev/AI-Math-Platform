from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.enums import AnswerPolicy
from app.seeds.question_types import CANONICAL_QUESTION_TYPES, seed_question_types
from app.services.question_answer_service import AnswerPolicyService


class QuestionTypeSeedTest(unittest.TestCase):
    def test_multiple_choice_has_canonical_catalog_metadata_and_policy(self) -> None:
        self.assertEqual(CANONICAL_QUESTION_TYPES, ({
            "name": "multiple_choice",
            "display_name": "Multiple choice",
            "description": "Choose one answer.",
            "sort_order": 1,
            "is_active": True,
        },))
        self.assertEqual(
            AnswerPolicyService.for_question_type_name("multiple_choice"),
            AnswerPolicy.OPTION_SINGLE,
        )
        self.assertEqual(
            AnswerPolicyService.for_question_type_name("open_response"),
            AnswerPolicy.ACCEPTED_ANSWER,
        )

    def test_seed_creates_missing_multiple_choice_once(self) -> None:
        db = MagicMock()
        db.scalars.return_value.all.return_value = []

        seed_question_types(db)

        created = db.add.call_args.args[0]
        self.assertEqual(created.name, "multiple_choice")
        self.assertEqual(created.display_name, "Multiple choice")
        self.assertEqual(created.sort_order, 1)
        self.assertTrue(created.is_active)
        db.commit.assert_called_once()

    def test_seed_reuses_existing_code_and_does_not_touch_open_response(self) -> None:
        existing = SimpleNamespace(
            name="multiple_choice",
            display_name="Old",
            description=None,
            sort_order=99,
            is_active=False,
            deleted_at=object(),
        )
        open_response = SimpleNamespace(
            name="open_response",
            display_name="Open response",
            description=None,
            sort_order=2,
            is_active=True,
            deleted_at=None,
        )
        db = MagicMock()
        db.scalars.return_value.all.return_value = [existing]

        seed_question_types(db)

        db.add.assert_not_called()
        self.assertEqual(existing.display_name, "Multiple choice")
        self.assertEqual(existing.description, "Choose one answer.")
        self.assertEqual(existing.sort_order, 1)
        self.assertTrue(existing.is_active)
        self.assertIsNone(existing.deleted_at)
        self.assertEqual(open_response.display_name, "Open response")
        self.assertEqual(open_response.sort_order, 2)
        self.assertTrue(open_response.is_active)
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
