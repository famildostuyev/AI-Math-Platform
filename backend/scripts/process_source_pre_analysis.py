from __future__ import annotations

import logging
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.source_pre_analysis_worker_service import (
    SourcePreAnalysisWorkerService,
)


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    try:
        summary = SourcePreAnalysisWorkerService().run_once()
    except Exception:
        logging.getLogger(__name__).error(
            "Source pre-analysis worker stopped because of an infrastructure failure."
        )
        return 1

    print(
        "Source pre-analysis complete: "
        f"discovered={summary.discovered}, "
        f"succeeded={summary.succeeded}, failed={summary.failed}, "
        f"claim_skipped={summary.claim_skipped}, "
        f"reconciliation_required={summary.reconciliation_required}, "
        f"stale_recovered={summary.stale_recovered}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
