from __future__ import annotations

import re
import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import QuestionExtractionRunStatus
from app.core.security import utc_now
from app.models.question_extraction_result import QuestionExtractionResult
from app.models.question_extraction_run import QuestionExtractionRun
from app.services.document_analysis_provider import DocumentAnalysis


ANALYSIS_PROCESSOR_NAME = "document-analysis"
_ANALYSIS_ID_NAMESPACE = uuid.UUID("69a86642-e52d-4ca0-9236-55f67fa148da")


class QuestionExtractionAnalysisResultError(Exception):
    pass


class QuestionExtractionAnalysisRunNotFoundError(
    QuestionExtractionAnalysisResultError
):
    pass


class QuestionExtractionAnalysisResultExistsError(
    QuestionExtractionAnalysisResultError
):
    pass


class QuestionExtractionAnalysisInvalidRunStateError(
    QuestionExtractionAnalysisResultError
):
    pass


def _variant_name(question_number: str | None) -> str | None:
    if question_number:
        match = re.search(r"variant\s+([^/]+)", question_number, re.IGNORECASE)
        if match:
            return f"Variant {match.group(1).strip().upper()}"
    return None


def map_document_analysis(
    *, run_id: uuid.UUID, analysis: DocumentAnalysis,
) -> dict[str, object]:
    questions: list[dict[str, object]] = []
    variants: Counter[str] = Counter()
    for sequence_number, question in enumerate(analysis.questions, start=1):
        variant = _variant_name(question.question_number)
        if variant is not None:
            variants[variant] += 1
        questions.append({
            "id": str(uuid.uuid5(
                _ANALYSIS_ID_NAMESPACE, f"{run_id}:{sequence_number}",
            )),
            "sequence_number": sequence_number,
            "question_number": question.question_number,
            "variant": variant,
            "source_pages": [{
                "source_document_page_id": str(reference.source_document_page_id),
                "page_number": reference.page_number,
            } for reference in question.source_pages],
            "question_text": question.question_text,
            "answer_options": [
                {"label": option.label, "text": option.text}
                for option in question.answer_options
            ],
            "confidence": str(question.confidence),
            "needs_review": question.needs_review,
            "corrections": [{
                "original_value": correction.original_value,
                "normalized_value": correction.normalized_value,
                "reason": correction.reason,
            } for correction in question.corrections],
            "visual_required": question.visual_required,
        })
    return {
        "detected_language": analysis.detected_language,
        "total_questions": len(questions),
        "blocks": [
            {"name": name, "question_count": count}
            for name, count in sorted(variants.items())
        ],
        "needs_review_count": sum(bool(item["needs_review"]) for item in questions),
        "corrections_count": sum(len(item["corrections"]) for item in questions),
        "visual_required_count": sum(
            bool(item["visual_required"]) for item in questions
        ),
        "multi_page_question_count": sum(
            len(item["source_pages"]) > 1 for item in questions
        ),
        "questions": questions,
    }


class QuestionExtractionAnalysisResultService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_result(
        self, *, run_id: uuid.UUID, analysis: DocumentAnalysis,
    ) -> QuestionExtractionResult:
        try:
            run = self.db.scalar(
                select(QuestionExtractionRun)
                .where(QuestionExtractionRun.id == run_id)
                .with_for_update()
            )
            if run is None:
                raise QuestionExtractionAnalysisRunNotFoundError(
                    "Question extraction run was not found."
                )
            existing = self.db.scalar(
                select(QuestionExtractionResult).where(
                    QuestionExtractionResult.question_extraction_run_id == run_id
                )
            )
            if existing is not None:
                raise QuestionExtractionAnalysisResultExistsError(
                    "Question extraction analysis result already exists."
                )
            if run.status != QuestionExtractionRunStatus.RUNNING:
                raise QuestionExtractionAnalysisInvalidRunStateError(
                    "Question extraction run is not running."
                )
            provenance = analysis.provenance
            result = QuestionExtractionResult(
                question_extraction_run_id=run_id,
                schema_version=analysis.schema_version,
                processor_name=ANALYSIS_PROCESSOR_NAME,
                processor_version=provenance.processor_version,
                provider_name=provenance.provider_name,
                model_name=provenance.model_name,
                prompt_version=provenance.prompt_version,
                processing_version=provenance.processor_version,
                analysis_data=map_document_analysis(
                    run_id=run_id, analysis=analysis,
                ),
            )
            self.db.add(result)
            run.status = QuestionExtractionRunStatus.SUCCEEDED
            run.completed_at = utc_now()
            run.failure_message = None
            self.db.commit()
            return result
        except IntegrityError as exc:
            self.db.rollback()
            raise QuestionExtractionAnalysisResultExistsError(
                "Question extraction analysis result already exists."
            ) from exc
        except Exception:
            self.db.rollback()
            raise
