from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from scripts import process_question_extraction as command


class QuestionExtractionWorkerCommandTest(unittest.TestCase):
    def test_run_id_is_parsed_and_delegated_exactly(self) -> None:
        run_id = uuid.uuid4()
        worker = MagicMock()
        worker.run_once.return_value = MagicMock(
            discovered=1,
            succeeded=1,
            failed=0,
            start_skipped=0,
        )
        with patch.object(
            command,
            "QuestionExtractionWorkerService",
            return_value=worker,
        ):
            exit_code = command.main(("--run-id", str(run_id)))
        self.assertEqual(exit_code, 0)
        worker.run_once.assert_called_once_with(run_id=run_id)

    def test_default_command_preserves_queue_mode(self) -> None:
        worker = MagicMock()
        worker.run_once.return_value = MagicMock(
            discovered=0,
            succeeded=0,
            failed=0,
            start_skipped=0,
        )
        with patch.object(
            command,
            "QuestionExtractionWorkerService",
            return_value=worker,
        ):
            exit_code = command.main(())
        self.assertEqual(exit_code, 0)
        worker.run_once.assert_called_once_with(run_id=None)

    def test_invalid_run_id_is_rejected_before_worker_construction(self) -> None:
        with (
            patch.object(command, "QuestionExtractionWorkerService") as worker,
            self.assertRaises(SystemExit) as captured,
        ):
            command.main(("--run-id", "not-a-uuid"))
        self.assertEqual(captured.exception.code, 2)
        worker.assert_not_called()

    def test_command_has_no_provider_or_openai_composition(self) -> None:
        source = Path(command.__file__).read_text(encoding="utf-8")
        self.assertNotIn("OpenAIDocumentAnalysisProvider", source)
        self.assertNotIn("OPENAI_API_KEY", source)


if __name__ == "__main__":
    unittest.main()
