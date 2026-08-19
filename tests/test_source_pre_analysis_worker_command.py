from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


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

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
SCRIPT_PATH = BACKEND_DIR / "scripts" / "process_source_pre_analysis.py"


def _load_command():
    spec = importlib.util.spec_from_file_location(
        "process_source_pre_analysis_command", SCRIPT_PATH
    )
    if spec is None or spec.loader is None:
        raise AssertionError("Worker command could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SourcePreAnalysisWorkerCommandTest(unittest.TestCase):
    def test_command_invokes_worker_once_and_prints_safe_summary(self) -> None:
        command = _load_command()
        summary = command.SourcePreAnalysisWorkerSummary(3, 1, 1, 1, 0, 2) if hasattr(command, "SourcePreAnalysisWorkerSummary") else None
        if summary is None:
            from app.services.source_pre_analysis_worker_service import SourcePreAnalysisWorkerSummary
            summary = SourcePreAnalysisWorkerSummary(3, 1, 1, 1, 0, 2)
        with patch.object(command, "SourcePreAnalysisWorkerService") as worker:
            worker.return_value.run_once.return_value = summary
            output = StringIO()
            with redirect_stdout(output):
                exit_code = command.main()
        self.assertEqual(exit_code, 0)
        worker.assert_called_once_with()
        worker.return_value.run_once.assert_called_once_with()
        self.assertEqual(
            output.getvalue().strip(),
            "Source pre-analysis complete: discovered=3, succeeded=1, "
            "failed=1, claim_skipped=1, reconciliation_required=0, "
            "stale_recovered=2",
        )

    def test_infrastructure_failure_returns_nonzero_without_raw_details(self) -> None:
        command = _load_command()
        with (
            patch.object(command, "SourcePreAnalysisWorkerService") as worker,
            patch.object(command.logging, "getLogger") as get_logger,
        ):
            worker.return_value.run_once.side_effect = RuntimeError("storage-secret")
            self.assertEqual(command.main(), 1)
        get_logger.return_value.exception.assert_not_called()
        message = get_logger.return_value.error.call_args.args[0]
        self.assertNotIn("storage-secret", message)

    def test_script_has_no_polling_or_arbitrary_execution_arguments(self) -> None:
        source = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertNotIn("while ", source)
        self.assertNotIn("sleep(", source)
        self.assertNotIn("argparse", source)
        self.assertNotIn("run_id", source)
        self.assertNotIn("mime_type", source)


if __name__ == "__main__":
    unittest.main()
