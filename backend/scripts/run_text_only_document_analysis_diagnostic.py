from __future__ import annotations

import sys
import time
import uuid
from pathlib import Path

from sqlalchemy import select


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.database.session import SessionLocal
from app.models.media_asset import MediaAsset
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage
from app.services.document_analysis_provider import (
    DocumentAnalysisPageReference,
    DocumentAnalysisProviderError,
)
from app.services.openai_document_analysis_provider import (
    DOCUMENT_ANALYSIS_INSTRUCTIONS,
    OpenAIDocumentAnalysisProvider,
    build_document_analysis_request,
)
from app.services.pdf_raw_document_extractor import PdfRawDocumentExtractor
from app.services.raw_document import RawDocument
from app.storage.media_storage import LocalMediaStorage, MediaStorageError
from scripts.run_real_ksq_document_analysis import summarize_analysis


SOURCE_DOCUMENT_ID = uuid.UUID("93d1636e-1ad2-4370-8194-89c56fb45205")
EXPECTED_MEDIA_ASSET_ID = uuid.UUID("550bb458-e6c1-4131-a0d3-01724135f5af")


def without_visual_content(raw_document: RawDocument) -> RawDocument:
    """Return the same immutable raw pages without visual provider input."""

    return RawDocument(
        source_document_id=raw_document.source_document_id,
        pages=tuple(
            page.model_copy(update={"visual_content": None})
            for page in raw_document.pages
        ),
    )


def main() -> int:
    if not settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY.strip():
        print("Diagnostic stopped: OPENAI_API_KEY is not configured.")
        return 2

    with SessionLocal() as db:
        row = db.execute(
            select(SourceDocument, MediaAsset)
            .join(MediaAsset, MediaAsset.id == SourceDocument.media_asset_id)
            .where(
                SourceDocument.id == SOURCE_DOCUMENT_ID,
                SourceDocument.deleted_at.is_(None),
                MediaAsset.deleted_at.is_(None),
            )
        ).first()
        pages = tuple(
            db.scalars(
                select(SourceDocumentPage)
                .where(
                    SourceDocumentPage.source_document_id == SOURCE_DOCUMENT_ID,
                    SourceDocumentPage.deleted_at.is_(None),
                )
                .order_by(SourceDocumentPage.page_number)
            ).all()
        )

    if row is None or row[1].id != EXPECTED_MEDIA_ASSET_ID or not pages:
        print("Diagnostic stopped: immutable source material is unavailable.")
        return 3

    media_asset = row[1]
    try:
        with LocalMediaStorage(settings.MEDIA_ROOT).open_key(
            media_asset.storage_key
        ) as stream:
            raw_document = PdfRawDocumentExtractor().extract(
                source_document_id=SOURCE_DOCUMENT_ID,
                source_pages=tuple(
                    DocumentAnalysisPageReference(
                        source_document_page_id=page.id,
                        page_number=page.page_number,
                    )
                    for page in pages
                ),
                stream=stream,
            )
    except MediaStorageError:
        print("Diagnostic stopped: immutable source binary is unavailable.")
        return 3

    request = build_document_analysis_request(
        without_visual_content(raw_document)
    )
    started = time.perf_counter()
    try:
        analysis = OpenAIDocumentAnalysisProvider(
            instructions=DOCUMENT_ANALYSIS_INSTRUCTIONS,
        ).analyze_document(request)
    except DocumentAnalysisProviderError as exc:
        duration = time.perf_counter() - started
        category = getattr(exc, "safe_category", "provider_error")
        print("result=failure")
        print(f"safe_category={category}")
        print(f"timeout={category == 'timeout'}")
        print("http_status=unknown")
        print(f"duration_seconds={duration:.3f}")
        return 4

    duration = time.perf_counter() - started
    print("result=success")
    print("http_status=success")
    print(f"duration_seconds={duration:.3f}")
    for key, value in summarize_analysis(analysis).items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
