from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.question_extraction_result import QuestionExtractionResult
from app.models.source_document_page import SourceDocumentPage
from app.services.document_analysis_provider import (
    DocumentAnalysisProvider,
    DocumentAnalysisProviderAPIError,
    DocumentAnalysisProviderError,
    DocumentAnalysisProviderInvalidResponseError,
    DocumentAnalysisProviderNetworkError,
    DocumentAnalysisProviderRateLimitError,
    DocumentAnalysisProviderTimeoutError,
    DocumentAnalysisPageReference,
)
from app.services.openai_document_analysis_provider import (
    build_document_analysis_request,
)
from app.services.pdf_raw_document_extractor import (
    PdfRawDocumentExtractionError,
    PdfRawDocumentExtractor,
)
from app.services.question_extraction_analysis_result_service import (
    QuestionExtractionAnalysisResultError,
    QuestionExtractionAnalysisResultService,
)
from app.services.question_extraction_service import QuestionExtractionService
from app.services.question_extraction_source_service import (
    QuestionExtractionSourceService,
    QuestionExtractionSourceServiceError,
)


class QuestionExtractionDocumentAnalysisExecutionError(Exception):
    """Safe base error for one document-analysis execution attempt."""


class QuestionExtractionDocumentAnalysisAlreadyFinalizedError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    pass


class QuestionExtractionDocumentAnalysisStartError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    pass


class QuestionExtractionDocumentAnalysisSourceError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    pass


class QuestionExtractionDocumentAnalysisInputError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    pass


class QuestionExtractionDocumentAnalysisProviderTimeoutError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "timeout"
    pass


class QuestionExtractionDocumentAnalysisProviderRateLimitError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "rate_limit"
    pass


class QuestionExtractionDocumentAnalysisProviderResponseError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "invalid_response"
    pass


class QuestionExtractionDocumentAnalysisProviderAPIError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "provider_api_error"


class QuestionExtractionDocumentAnalysisProviderNetworkError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "provider_network_error"


class QuestionExtractionDocumentAnalysisProviderError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "unknown_provider_error"
    pass


class QuestionExtractionDocumentAnalysisFinalizationError(
    QuestionExtractionDocumentAnalysisExecutionError
):
    safe_category = "finalization_error"
    pass


class AnalysisResultPresenceResolver(Protocol):
    def exists_for_run(self, *, run_id: uuid.UUID) -> bool: ...


class SourceDocumentPageIdentityResolver(Protocol):
    def resolve_for_source(
        self, *, source_document_id: uuid.UUID,
    ) -> tuple[DocumentAnalysisPageReference, ...]: ...


class DatabaseAnalysisResultPresenceResolver:
    def __init__(self, db: Session) -> None:
        self.db = db

    def exists_for_run(self, *, run_id: uuid.UUID) -> bool:
        return self.db.scalar(
            select(QuestionExtractionResult.id)
            .where(QuestionExtractionResult.question_extraction_run_id == run_id)
            .limit(1)
        ) is not None


class DatabaseSourceDocumentPageIdentityResolver:
    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_for_source(
        self, *, source_document_id: uuid.UUID,
    ) -> tuple[DocumentAnalysisPageReference, ...]:
        pages = self.db.scalars(
            select(SourceDocumentPage)
            .where(
                SourceDocumentPage.source_document_id == source_document_id,
                SourceDocumentPage.deleted_at.is_(None),
            )
            .order_by(SourceDocumentPage.page_number.asc())
        ).all()
        return tuple(
            DocumentAnalysisPageReference(
                source_document_page_id=page.id,
                page_number=page.page_number,
            )
            for page in pages
        )


class QuestionExtractionDocumentAnalysisExecutionService:
    """Orchestrate provider-neutral analysis without creating candidates."""

    def __init__(
        self,
        *,
        lifecycle_service: QuestionExtractionService,
        source_service: QuestionExtractionSourceService,
        page_identity_resolver: SourceDocumentPageIdentityResolver,
        result_presence_resolver: AnalysisResultPresenceResolver,
        raw_document_extractor: PdfRawDocumentExtractor,
        provider: DocumentAnalysisProvider,
        result_service: QuestionExtractionAnalysisResultService,
    ) -> None:
        self.lifecycle_service = lifecycle_service
        self.source_service = source_service
        self.page_identity_resolver = page_identity_resolver
        self.result_presence_resolver = result_presence_resolver
        self.raw_document_extractor = raw_document_extractor
        self.provider = provider
        self.result_service = result_service

    def execute_run(self, *, run_id: uuid.UUID) -> QuestionExtractionResult:
        if not isinstance(run_id, uuid.UUID):
            raise QuestionExtractionDocumentAnalysisStartError(
                "Document analysis run ID is invalid."
            )
        try:
            result_exists = self.result_presence_resolver.exists_for_run(
                run_id=run_id,
            )
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisStartError(
                "Document analysis run could not be checked."
            ) from exc
        if result_exists:
            raise QuestionExtractionDocumentAnalysisAlreadyFinalizedError(
                "Document analysis result already exists."
            )
        try:
            self.lifecycle_service.start_run(run_id=run_id)
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisStartError(
                "Document analysis run could not be started."
            ) from exc

        try:
            with self.source_service.open_for_run(run_id=run_id) as source:
                page_identities = self.page_identity_resolver.resolve_for_source(
                    source_document_id=source.source_document_id,
                )
                if not page_identities:
                    raise QuestionExtractionDocumentAnalysisInputError(
                        "Document analysis source pages are unavailable."
                    )
                raw_document = self.raw_document_extractor.extract(
                    source_document_id=source.source_document_id,
                    source_pages=page_identities,
                    stream=source.stream,
                )
        except QuestionExtractionDocumentAnalysisInputError:
            raise
        except QuestionExtractionSourceServiceError as exc:
            raise QuestionExtractionDocumentAnalysisSourceError(
                "Document analysis source is unavailable."
            ) from exc
        except PdfRawDocumentExtractionError as exc:
            raise QuestionExtractionDocumentAnalysisInputError(
                "Document analysis input could not be prepared."
            ) from exc
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisInputError(
                "Document analysis input could not be prepared."
            ) from exc

        try:
            request = build_document_analysis_request(raw_document)
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisInputError(
                "Document analysis input could not be prepared."
            ) from exc
        try:
            analysis = self.provider.analyze_document(request)
        except DocumentAnalysisProviderTimeoutError as exc:
            raise QuestionExtractionDocumentAnalysisProviderTimeoutError(
                "Document analysis provider timed out."
            ) from exc
        except DocumentAnalysisProviderRateLimitError as exc:
            raise QuestionExtractionDocumentAnalysisProviderRateLimitError(
                "Document analysis provider rate limit was exceeded."
            ) from exc
        except DocumentAnalysisProviderInvalidResponseError as exc:
            raise QuestionExtractionDocumentAnalysisProviderResponseError(
                "Document analysis provider response is invalid."
            ) from exc
        except DocumentAnalysisProviderAPIError as exc:
            raise QuestionExtractionDocumentAnalysisProviderAPIError(
                "Document analysis provider request failed."
            ) from exc
        except DocumentAnalysisProviderNetworkError as exc:
            raise QuestionExtractionDocumentAnalysisProviderNetworkError(
                "Document analysis provider network request failed."
            ) from exc
        except DocumentAnalysisProviderError as exc:
            raise QuestionExtractionDocumentAnalysisProviderError(
                "Document analysis provider request failed."
            ) from exc
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisProviderError(
                "Document analysis provider request failed."
            ) from exc

        try:
            return self.result_service.create_result(
                run_id=run_id,
                analysis=analysis,
            )
        except QuestionExtractionAnalysisResultError as exc:
            raise QuestionExtractionDocumentAnalysisFinalizationError(
                "Document analysis result could not be finalized."
            ) from exc
        except Exception as exc:
            raise QuestionExtractionDocumentAnalysisFinalizationError(
                "Document analysis result could not be finalized."
            ) from exc
