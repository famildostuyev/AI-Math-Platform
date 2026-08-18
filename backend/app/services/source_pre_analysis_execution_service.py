from __future__ import annotations

import uuid
from typing import NoReturn

from sqlalchemy.orm import Session

from app.services.source_pre_analysis_output_service import (
    SourcePreAnalysisOutputService,
)
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorSelector,
    SourcePreAnalysisUnsupportedMimeError,
    validate_processor_execution,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisFinalization,
    SourcePreAnalysisInvalidRunStateError,
    SourcePreAnalysisResultAlreadyExistsError,
    SourcePreAnalysisService,
)
from app.services.source_pre_analysis_source_service import (
    SourcePreAnalysisSourceService,
    SourcePreAnalysisSourceServiceError,
)


SOURCE_FAILURE_MESSAGE = "Source binary is unavailable."
UNSUPPORTED_SOURCE_FAILURE_MESSAGE = (
    "Source file type is unsupported for pre-analysis."
)
PROCESSOR_FAILURE_MESSAGE = "Source pre-analysis processing failed."
INVALID_OUTPUT_FAILURE_MESSAGE = "Processor output was invalid."
OUTPUT_FAILURE_MESSAGE = (
    "Processor output could not be mapped to source pages."
)
FINALIZATION_FAILURE_MESSAGE = (
    "Pre-analysis output could not be persisted."
)


class SourcePreAnalysisExecutionError(Exception):
    """Base exception for trusted pre-analysis execution failures."""


class SourcePreAnalysisExecutionValidationError(
    SourcePreAnalysisExecutionError
):
    """Raised when the trusted execution request is invalid."""


class SourcePreAnalysisExecutionStartError(SourcePreAnalysisExecutionError):
    """Raised when the pending run cannot be claimed for execution."""


class SourcePreAnalysisExecutionSourceError(SourcePreAnalysisExecutionError):
    """Raised when the persisted source binary cannot be resolved."""


class SourcePreAnalysisExecutionUnsupportedSourceError(
    SourcePreAnalysisExecutionError
):
    """Raised when no processor supports the persisted source MIME type."""


class SourcePreAnalysisExecutionProcessorError(
    SourcePreAnalysisExecutionError
):
    """Raised when processor selection or execution fails."""


class SourcePreAnalysisExecutionInvalidOutputError(
    SourcePreAnalysisExecutionError
):
    """Raised when processor execution violates its trusted contract."""


class SourcePreAnalysisExecutionOutputError(SourcePreAnalysisExecutionError):
    """Raised when processor output cannot be prepared for persistence."""


class SourcePreAnalysisExecutionFinalizationError(
    SourcePreAnalysisExecutionError
):
    """Raised when prepared output cannot be finalized."""


class SourcePreAnalysisExecutionFailureTransitionError(
    SourcePreAnalysisExecutionError
):
    """Raised when both execution and its failure transition fail."""

    def __init__(
        self,
        *,
        execution_error: SourcePreAnalysisExecutionError,
        transition_error: Exception,
    ) -> None:
        super().__init__(
            "Source pre-analysis failed and could not be marked failed."
        )
        self.execution_error = execution_error
        self.transition_error = transition_error


class SourcePreAnalysisExecutionReconciliationRequiredError(
    SourcePreAnalysisExecutionError
):
    """Raised when the final persisted state cannot be safely inferred."""

    def __init__(
        self,
        *,
        finalization_error: SourcePreAnalysisExecutionFinalizationError,
        transition_error: Exception,
    ) -> None:
        super().__init__(
            "Source pre-analysis final state requires reconciliation."
        )
        self.finalization_error = finalization_error
        self.transition_error = transition_error


class SourcePreAnalysisExecutionService:
    """Synchronously orchestrate one trusted source pre-analysis run."""

    def __init__(
        self,
        db: Session,
        *,
        processor_selector: SourcePreAnalysisProcessorSelector,
        lifecycle_service: SourcePreAnalysisService | None = None,
        source_service: SourcePreAnalysisSourceService | None = None,
        output_service: SourcePreAnalysisOutputService | None = None,
    ) -> None:
        self.db = db
        self.processor_selector = processor_selector
        self.lifecycle_service = (
            lifecycle_service or SourcePreAnalysisService(db)
        )
        self.source_service = (
            source_service or SourcePreAnalysisSourceService(db)
        )
        self.output_service = (
            output_service or SourcePreAnalysisOutputService(db)
        )

    def execute_run(
        self,
        *,
        run_id: uuid.UUID,
    ) -> SourcePreAnalysisFinalization:
        if type(run_id) is not uuid.UUID:
            raise SourcePreAnalysisExecutionValidationError(
                "Source pre-analysis run ID must be a UUID."
            )

        try:
            self.lifecycle_service.start_run(run_id=run_id)
        except Exception as exc:
            raise SourcePreAnalysisExecutionStartError(
                "Source pre-analysis run could not be started."
            ) from exc

        try:
            with self.source_service.open_for_run(run_id=run_id) as source:
                try:
                    processor = self.processor_selector.select(
                        mime_type=source.mime_type,
                    )
                except SourcePreAnalysisUnsupportedMimeError as exc:
                    raise SourcePreAnalysisExecutionUnsupportedSourceError(
                        UNSUPPORTED_SOURCE_FAILURE_MESSAGE
                    ) from exc
                except Exception as exc:
                    raise SourcePreAnalysisExecutionProcessorError(
                        PROCESSOR_FAILURE_MESSAGE
                    ) from exc

                try:
                    execution = processor.process(source=source)
                except Exception as exc:
                    raise SourcePreAnalysisExecutionProcessorError(
                        PROCESSOR_FAILURE_MESSAGE
                    ) from exc
        except SourcePreAnalysisExecutionError as execution_error:
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=execution_error,
                failure_message=str(execution_error),
            )
        except SourcePreAnalysisSourceServiceError as exc:
            execution_error = SourcePreAnalysisExecutionSourceError(
                SOURCE_FAILURE_MESSAGE
            )
            execution_error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=execution_error,
                failure_message=SOURCE_FAILURE_MESSAGE,
            )
        except Exception as exc:
            execution_error = SourcePreAnalysisExecutionSourceError(
                SOURCE_FAILURE_MESSAGE
            )
            execution_error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=execution_error,
                failure_message=SOURCE_FAILURE_MESSAGE,
            )

        try:
            validated_execution = validate_processor_execution(execution)
        except Exception as exc:
            execution_error = SourcePreAnalysisExecutionInvalidOutputError(
                INVALID_OUTPUT_FAILURE_MESSAGE
            )
            execution_error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=execution_error,
                failure_message=INVALID_OUTPUT_FAILURE_MESSAGE,
            )

        try:
            prepared = self.output_service.prepare_finalization_inputs(
                run_id=run_id,
                processor_result=validated_execution.result,
            )
        except Exception as exc:
            execution_error = SourcePreAnalysisExecutionOutputError(
                OUTPUT_FAILURE_MESSAGE
            )
            execution_error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=execution_error,
                failure_message=OUTPUT_FAILURE_MESSAGE,
            )

        try:
            return self.lifecycle_service.finalize_success(
                run_id=run_id,
                result=prepared.result,
                findings=prepared.findings,
                provenance=validated_execution.provenance,
            )
        except Exception as exc:
            finalization_error = SourcePreAnalysisExecutionFinalizationError(
                FINALIZATION_FAILURE_MESSAGE
            )
            finalization_error.__cause__ = exc
            self._raise_after_failure_transition(
                run_id=run_id,
                execution_error=finalization_error,
                failure_message=FINALIZATION_FAILURE_MESSAGE,
                finalization_failure=True,
            )

    def _raise_after_failure_transition(
        self,
        *,
        run_id: uuid.UUID,
        execution_error: SourcePreAnalysisExecutionError,
        failure_message: str,
        finalization_failure: bool = False,
    ) -> NoReturn:
        try:
            self.lifecycle_service.mark_failed(
                run_id=run_id,
                failure_message=failure_message,
            )
        except Exception as transition_error:
            if finalization_failure and isinstance(
                transition_error,
                (
                    SourcePreAnalysisInvalidRunStateError,
                    SourcePreAnalysisResultAlreadyExistsError,
                ),
            ):
                if not isinstance(
                    execution_error,
                    SourcePreAnalysisExecutionFinalizationError,
                ):
                    raise AssertionError(
                        "Reconciliation requires a finalization error."
                    )
                raise SourcePreAnalysisExecutionReconciliationRequiredError(
                    finalization_error=execution_error,
                    transition_error=transition_error,
                ) from transition_error
            raise SourcePreAnalysisExecutionFailureTransitionError(
                execution_error=execution_error,
                transition_error=transition_error,
            ) from transition_error

        original_error = execution_error.__cause__
        if original_error is None:
            raise execution_error
        raise execution_error from original_error
