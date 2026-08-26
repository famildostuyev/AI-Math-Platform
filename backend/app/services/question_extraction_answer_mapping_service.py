from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import AnswerPolicy, QuestionRevisionStatus
from app.models.answer_option import AnswerOption
from app.models.question_extraction_result import QuestionExtractionResult
from app.models.question_revision import QuestionRevision
from app.schemas.question_answer import AnswerOptionRead
from app.schemas.question_extraction import QuestionExtractionAnalysisRead
from app.schemas.structured_text import StructuredTextDocument
from app.services.question_answer_service import AnswerPolicyService, QuestionAnswerService

_MAPPING_NAMESPACE = uuid.UUID("971d07d7-058a-445e-ae78-6c5bf1f24bd5")


class QuestionExtractionAnswerMappingError(Exception): pass
class ExtractionMappingRevisionNotFoundError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingRevisionNotEditableError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingRevisionConflictError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingResultNotFoundError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingQuestionNotFoundError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingInvalidPayloadError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingExistingAnswersConflictError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingPolicyError(QuestionExtractionAnswerMappingError): pass
class ExtractionMappingIntegrityError(QuestionExtractionAnswerMappingError): pass


class QuestionExtractionAnswerMappingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def map_options_to_revision(self, *, extraction_result_id: uuid.UUID,
        extraction_question_id: uuid.UUID, target_revision_id: uuid.UUID,
        expected_revision_updated_at: datetime) -> list[AnswerOptionRead]:
        try:
            revision = self.db.scalar(select(QuestionRevision).where(
                QuestionRevision.id == target_revision_id,
                QuestionRevision.deleted_at.is_(None),
            ).with_for_update())
            if revision is None: raise ExtractionMappingRevisionNotFoundError()
            if revision.status != QuestionRevisionStatus.DRAFT: raise ExtractionMappingRevisionNotEditableError()
            if revision.updated_at != expected_revision_updated_at: raise ExtractionMappingRevisionConflictError()
            policy = AnswerPolicyService.for_question_type_name(revision.question_form.question_type.name)
            if policy not in {AnswerPolicy.OPTION_SINGLE, AnswerPolicy.OPTION_MULTIPLE}:
                raise ExtractionMappingPolicyError()

            result = self.db.scalar(select(QuestionExtractionResult).where(QuestionExtractionResult.id == extraction_result_id))
            if result is None: raise ExtractionMappingResultNotFoundError()
            try:
                analysis = QuestionExtractionAnalysisRead.model_validate(result.analysis_data)
            except ValidationError as exc:
                raise ExtractionMappingInvalidPayloadError() from exc
            question = next((item for item in analysis.questions if item.id == extraction_question_id), None)
            if question is None: raise ExtractionMappingQuestionNotFoundError()
            if not question.answer_options: raise ExtractionMappingInvalidPayloadError()
            if any(not option.text.strip() or (option.label is not None and not option.label.strip()) for option in question.answer_options):
                raise ExtractionMappingInvalidPayloadError()

            mapped_all = list(self.db.scalars(select(AnswerOption).where(
                AnswerOption.revision_id == revision.id,
                AnswerOption.source_extraction_result_id == result.id,
                AnswerOption.source_extraction_question_id == question.id,
            ).order_by(AnswerOption.source_option_index)).all())
            if any(item.deleted_at is not None for item in mapped_all):
                raise ExtractionMappingExistingAnswersConflictError()
            mapped = mapped_all
            if mapped:
                if [item.source_option_index for item in mapped] != list(range(1, len(question.answer_options) + 1)):
                    raise ExtractionMappingIntegrityError()
                return [QuestionAnswerService._option_read(item) for item in mapped]

            existing = list(self.db.scalars(select(AnswerOption).where(
                AnswerOption.revision_id == revision.id, AnswerOption.deleted_at.is_(None),
            ).with_for_update()).all())
            if existing: raise ExtractionMappingExistingAnswersConflictError()

            created: list[AnswerOption] = []
            for index, source in enumerate(question.answer_options, start=1):
                document = self._document(source.text, source.content)
                option = AnswerOption(
                    id=uuid.uuid5(_MAPPING_NAMESPACE, f"{revision.id}:{result.id}:{question.id}:{index}"),
                    revision_id=revision.id, label=source.label, order_index=index * 1000,
                    source_text=source.text, document_data=document.model_dump(mode="json"),
                    format_version=1, is_correct=False,
                    source_extraction_result_id=result.id,
                    source_extraction_question_id=question.id, source_option_index=index,
                    source_provenance={"question_extraction_run_id": str(result.question_extraction_run_id),
                        "extraction_result_id": str(result.id), "extraction_question_id": str(question.id),
                        "sequence_number": question.sequence_number, "question_number": question.question_number,
                        "source_pages": [page.model_dump(mode="json") for page in question.source_pages],
                        "original_label": source.label, "original_order": index},
                )
                self.db.add(option); created.append(option)
            self.db.flush()
            revision.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            return [QuestionAnswerService._option_read(item) for item in created]
        except IntegrityError as exc:
            self.db.rollback(); raise ExtractionMappingIntegrityError() from exc
        except Exception:
            self.db.rollback(); raise

    @staticmethod
    def _document(text: str, content) -> StructuredTextDocument:
        inline: list[dict[str, object]] = []
        if content is None:
            inline.append({"type": "text", "text": text, "marks": []})
        else:
            for segment in content.segments:
                if segment.type == "text": inline.append({"type": "text", "text": segment.text, "marks": []})
                else: inline.append({"type": "inline_math", "latex": segment.latex})
        return StructuredTextDocument.model_validate({"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": inline}]})
