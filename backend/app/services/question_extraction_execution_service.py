from __future__ import annotations

import uuid
from typing import NoReturn

from sqlalchemy.orm import Session

from app.services.question_extraction_output_service import (
    QuestionExtractionOutputService,
)
from app.services.question_extraction_processor import (
    QuestionExtractionProcessorSelector,
    QuestionExtractionUnsupportedMimeError,
    validate_processor_execution,
)
from app.services.question_extraction_service import (
    QuestionExtractionService,
)
from app.services.question_extraction_source_service import (
    QuestionExtractionSourceService,
    QuestionExtractionSourceServiceError,
)


SOURCE_FAILURE_MESSAGE = "Source binary is unavailable."
UNSUPPORTED_SOURCE_FAILURE_MESSAGE = (
    "Source file type is unsupported for question extraction."
)
PROCESSOR_FAILURE_MESSAGE = "Question extraction processing failed."
INVALID_OUTPUT_FAILURE_MESSAGE = "Processor output was invalid."
OUTPUT_FAILURE_MESSAGE = (
    "Processor output could not be mapped to source pages."
)
FINALIZATION_FAILURE_MESSAGE = (
    "Question extraction output could not be persisted."
)


class QuestionExtractionExecutionError(Exception):
    """Base exception for trusted question extraction execution failures."""


class QuestionExtractionExecutionValidationError(
    QuestionExtractionExecutionError
):
    """Raised when the trusted execution request is invalid."""


class QuestionExtractionExecutionStartError(
    QuestionExtractionExecutionError
):
    """Raised when the pending extraction run cannot be started."""


class QuestionExtractionExecutionSourceError(
    QuestionExtractionExecutionError
):
    """Raised when the persisted source binary cannot be resolved."""


class QuestionExtractionExecutionUnsupportedSourceError(
    QuestionExtractionExecutionError
):
    """Raised when no processor supports the persisted source MIME type."""


class QuestionExtractionExecutionProcessorError(
    QuestionExtractionExecutionError
):
    """Raised when processor selection or execution fails."""


class QuestionExtractionExecutionInvalidOutputError(
    QuestionExtractionExecutionError
):
    """Raised when processor execution violates its trusted contract."""


class QuestionExtractionExecutionOutputError(
    QuestionExtractionExecutionError
):
    """Raised when processor output cannot be prepared for persistence."""


class QuestionExtractionExecutionFinalizationError(
    QuestionExtractionExecutionError
):
    """Raised when prepared candidate output cannot be finalized."""


class QuestionExtractionExecutionFailureTransitionError(
    QuestionExtractionExecutionError
):
    """Raised when both execution and its failure transition fail."""

    def __init__(
        self,
        *,
        execution_error: QuestionExtractionExecutionError,
        transition_error: Exception,
    ) -> None:
        super().__init__(
            "Question extraction failed and could not be marked failed."
        )
        self.execution_error = execution_error
        self.transition_error = transition_error


class QuestionExtractionExecutionService:
    """Synchronously orchestrate one trusted question extraction run."""

    def __init__(
        self,
        db: Session,
        *,
        processor_selector: QuestionExtractionProcessorSelector,
        lifecycle_service: QuestionExtractionService | None = None,
        source_service: QuestionExtractionSourceService | None = None,
        output_service: QuestionExtractionOutputService | None = None,
    ) -> None:
        self.db = db
        self.processor_selector = processor_selector
        self.lifecycle_service = (
            lifecycle_service or QuestionExtractionService(db)
        )
        self.source_service = (
            source_service or QuestionExtractionSourceService(db)
        )
        self.output_service = (
            output_service or QuestionExtractionOutputService(db)
        )

    def execute_run(
        self,
        *,
        run_id: uuid.UUID,
    ):
        if type(run_id) is not uuid.UUID:
            raise QuestionExtractionExecutionValidationError(
                "Question extraction run ID must be a UUID."
            )

        try:
            self.lifecycle_service.start_run(run_id=run_id)
        except Exception as exc:
            raise QuestionExtractionExecutionStartError(
                "Question extraction run could not be started."
            ) from exc

        try:
            with self.source_service.open_for_run(run_id=run_id) as source:
                try:
                    processor = self.processor_selector.select(
                        mime_type=source.mime_type,
                    )
                except QuestionExtractionUnsupportedMimeError as exc:
                    error = (
                        QuestionExtractionExecutionUnsupportedSourceError(
                            UNSUPPORTED_SOURCE_FAILURE_MESSAGE
                        )
                    )
                    error.__cause__ = exc
                    self._raise_after_failure_transition(
                        run_id=run_id,
                        execution_error=error,
                        failure_message=UNSUPPORTED_SOURCE_FAILURE_MESSAGE,
                    )
                except Exception as exc:
                    error = QuestionExtractionExecutionProcessorError(
                        PROCESSOR_FAILURE_MESSAGE
                    )
                    error.__cause__ = exc
                    self._raise_after_failure_transition(
                        run_id=run_id,
                        execution_error=error,
                        failure_message=PROCESSOR_FAILURE_MESSAGE,
                    )

                try:
                    execution = processor.process(source=source)
                except Exception as exc:
                    error = QuestionExtractionExecutionProcessorError(
                        PROCESSOR_FAILURE_MESSAGE
                    )
                    error.__cause__ = exc
                    self._raise_after_failure_transition(
                        run_id=run_id,
                        execution_error=error,
                        failure_message=PROCESSOR_FAILURE_MESSAGE,
                    )
        except QuestionExtractionExecutionError:
            raise
        except QuestionExtractionSourceServiceError as exc:
            error = QuestionExtractionExecutionSourceError(
                SOURCE_FAILURE_MESSAGE
            )
            error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=error,
                failure_message=SOURCE_FAILURE_MESSAGE,
            )
        except Exception as exc:
            error = QuestionExtractionExecutionSourceError(
                SOURCE_FAILURE_MESSAGE
            )
            error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=error,
                failure_message=SOURCE_FAILURE_MESSAGE,
            )

        try:
            validated_execution = validate_processor_execution(execution)
        except Exception as exc:
            error = QuestionExtractionExecutionInvalidOutputError(
                INVALID_OUTPUT_FAILURE_MESSAGE
            )
            error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=error,
                failure_message=INVALID_OUTPUT_FAILURE_MESSAGE,
            )

        try:
            candidates = self.output_service.prepare_finalization_inputs(
                run_id=run_id,
                processor_result=validated_execution.result,
            )
        except Exception as exc:
            error = QuestionExtractionExecutionOutputError(
                OUTPUT_FAILURE_MESSAGE
            )
            error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=error,
                failure_message=OUTPUT_FAILURE_MESSAGE,
            )

        try:
            return self.lifecycle_service.finalize_success(
                run_id=run_id,
                candidates=candidates,
            )
        except Exception as exc:
            error = QuestionExtractionExecutionFinalizationError(
                FINALIZATION_FAILURE_MESSAGE
            )
            error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=error,
                failure_message=FINALIZATION_FAILURE_MESSAGE,
            )

    def _raise_after_failure_transition(
        self,
        *,
        run_id: uuid.UUID,
        execution_error: QuestionExtractionExecutionError,
        failure_message: str,
    ) -> NoReturn:
        try:
            self.lifecycle_service.mark_failed(
                run_id=run_id,
                failure_message=failure_message,
            )
        except Exception as transition_error:
            raise QuestionExtractionExecutionFailureTransitionError(
                execution_error=execution_error,
                transition_error=transition_error,
            ) from transition_error

        original_error = execution_error.__cause__
        if original_error is None:
            raise execution_error
        raise execution_error from original_error
