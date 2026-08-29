from __future__ import annotations

import json
import logging
import sys
from typing import Final


ADMIN_AI_DIAGNOSTIC_LOGGERS: Final = (
    "app.services.admin_ai_orchestrator",
    "app.services.openai_admin_ai_planner",
)
_SAFE_EVENTS: Final = {
    "admin_ai_answer_fallback_selected",
    "admin_ai_plan_validation_failed",
    "admin_ai_planner_failed",
}
_HANDLER_MARKER = "_admin_ai_safe_diagnostic_handler"


class SafeAdminAIDiagnosticFormatter(logging.Formatter):
    """Serialize only allowlisted diagnostic metadata, never record arguments."""

    def format(self, record: logging.LogRecord) -> str:
        event = record.msg if isinstance(record.msg, str) and record.msg in _SAFE_EVENTS else "admin_ai_diagnostic"
        payload = {
            "event": event,
            "category": getattr(record, "category", None) or getattr(record, "failure_category", None),
            "validation_stage": getattr(record, "stage", None) or getattr(record, "validation_stage", None),
            "capability_name": getattr(record, "capability_name", None),
            "capability_version": getattr(record, "capability_version", None),
            "call_index": getattr(record, "call_index", None),
            "retry_count": getattr(record, "retry_count", 0),
            "outcome_kind": getattr(record, "outcome_kind", None),
            "requirement_types": getattr(record, "requirement_types", None),
            "proposal_persisted": getattr(record, "proposal_persisted", None),
            "validation_error_types": getattr(record, "validation_error_types", None),
            "validation_error_locations": getattr(record, "validation_error_locations", None),
        }
        return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def configure_safe_admin_ai_diagnostic_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.WARNING)
    handler.setFormatter(SafeAdminAIDiagnosticFormatter())
    setattr(handler, _HANDLER_MARKER, True)
    for logger_name in ADMIN_AI_DIAGNOSTIC_LOGGERS:
        logger = logging.getLogger(logger_name)
        existing = [item for item in logger.handlers if getattr(item, _HANDLER_MARKER, False)]
        safe_handler = existing[0] if existing else handler
        safe_handler.setLevel(logging.WARNING)
        safe_handler.setFormatter(SafeAdminAIDiagnosticFormatter())
        logger.handlers = [safe_handler]
        logger.setLevel(logging.WARNING)
        logger.propagate = False
