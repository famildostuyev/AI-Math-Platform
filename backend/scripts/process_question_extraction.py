from __future__ import annotations

import argparse
import logging
import sys
import uuid
from collections.abc import Sequence
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.question_extraction_worker_service import (
    QuestionExtractionWorkerService,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Process pending question extraction work.",
    )
    parser.add_argument(
        "--run-id",
        type=uuid.UUID,
        default=None,
        help="Process only one explicitly selected pending run.",
    )
    return parser


def main(argv: Sequence[str] = ()) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    try:
        summary = QuestionExtractionWorkerService().run_once(
            run_id=args.run_id,
        )
    except Exception:
        logging.getLogger(__name__).error(
            "Question extraction worker stopped because of an infrastructure failure."
        )
        return 1

    print(
        "Question extraction complete: "
        f"discovered={summary.discovered}, "
        f"succeeded={summary.succeeded}, "
        f"failed={summary.failed}, "
        f"start_skipped={summary.start_skipped}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
