from __future__ import annotations

import io
import json
import logging
import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from uvicorn.config import LOGGING_CONFIG

from app.core.logging_config import (
    ADMIN_AI_DIAGNOSTIC_LOGGERS,
    configure_safe_admin_ai_diagnostic_logging,
)


class AdminAILoggingConfigTest(unittest.TestCase):
    def test_runtime_style_safe_diagnostics_have_one_effective_sink(self) -> None:
        configure_safe_admin_ai_diagnostic_logging()
        streams: dict[int, tuple[logging.Handler, object]] = {}
        output = io.StringIO()
        try:
            for name in ADMIN_AI_DIAGNOSTIC_LOGGERS:
                logger = logging.getLogger(name)
                self.assertEqual(len(logger.handlers), 1)
                self.assertLessEqual(logger.getEffectiveLevel(), logging.WARNING)
                self.assertFalse(logger.propagate)
                handler = logger.handlers[0]
                streams.setdefault(id(handler), (handler, handler.stream))
                handler.setStream(output)
            logging.getLogger(ADMIN_AI_DIAGNOSTIC_LOGGERS[0]).warning(
                "admin_ai_plan_validation_failed",
                extra={
                    "category": "grounding_id_invalid", "stage": "grounding_validation",
                    "capability_name": "admin_ai.search_questions", "capability_version": 1,
                    "call_index": 1, "retry_count": 0, "instruction": "must not appear",
                    "raw_payload": {"must": "not appear"}, "secret": "must not appear",
                },
            )
            logging.getLogger(ADMIN_AI_DIAGNOSTIC_LOGGERS[1]).warning(
                "admin_ai_planner_failed",
                extra={
                    "failure_category": "response_schema_invalid",
                    "validation_stage": "provider_response_parse", "retry_count": 0,
                    "provider_raw_error": "must not appear",
                },
            )
        finally:
            for handler, stream in streams.values():
                handler.setStream(stream)
        lines = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["category"], "grounding_id_invalid")
        self.assertEqual(lines[1]["category"], "response_schema_invalid")
        serialized = json.dumps(lines).casefold()
        for forbidden in ("instruction", "raw_payload", "secret", "provider_raw_error", "must not appear"):
            self.assertNotIn(forbidden, serialized)

    def test_configuration_is_idempotent_and_preserves_uvicorn_logging(self) -> None:
        configure_safe_admin_ai_diagnostic_logging()
        configure_safe_admin_ai_diagnostic_logging()
        self.assertTrue(all(len(logging.getLogger(name).handlers) == 1 for name in ADMIN_AI_DIAGNOSTIC_LOGGERS))
        self.assertTrue({"uvicorn", "uvicorn.error", "uvicorn.access"}.issubset(LOGGING_CONFIG["loggers"]))


if __name__ == "__main__":
    unittest.main()
