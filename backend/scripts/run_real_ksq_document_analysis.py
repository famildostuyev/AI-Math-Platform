from __future__ import annotations

import re
import sys
import uuid
from collections import Counter
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
    DocumentAnalysis,
    DocumentAnalysisPageReference,
    DocumentAnalysisProviderError,
)
from app.services.openai_document_analysis_provider import (
    DOCUMENT_ANALYSIS_INSTRUCTIONS,
    OpenAIDocumentAnalysisProvider,
    build_document_analysis_request,
)
from app.services.pdf_raw_document_extractor import PdfRawDocumentExtractor
from app.storage.media_storage import LocalMediaStorage, MediaStorageError


SOURCE_DOCUMENT_ID = uuid.UUID("93d1636e-1ad2-4370-8194-89c56fb45205")
EXPECTED_MEDIA_ASSET_ID = uuid.UUID("550bb458-e6c1-4131-a0d3-01724135f5af")

ACCEPTANCE_INSTRUCTIONS = DOCUMENT_ANALYSIS_INSTRUCTIONS


def _variant_name(question_number: str | None) -> str:
    if question_number:
        match = re.search(r"variant\s+([cd])", question_number, re.IGNORECASE)
        if match:
            return f"Variant {match.group(1).upper()}"
    return "Unclassified"


def summarize_analysis(analysis: DocumentAnalysis) -> dict[str, object]:
    variants = Counter(
        _variant_name(question.question_number)
        for question in analysis.questions
    )
    return {
        "detected_language": analysis.detected_language,
        "total_questions": len(analysis.questions),
        "variant_counts": dict(sorted(variants.items())),
        "total_answer_options": sum(
            len(question.answer_options) for question in analysis.questions
        ),
        "needs_review_count": sum(
            question.needs_review for question in analysis.questions
        ),
        "corrections_count": sum(
            len(question.corrections) for question in analysis.questions
        ),
        "visual_required_count": sum(
            question.visual_required for question in analysis.questions
        ),
        "multi_page_question_count": sum(
            len(question.source_pages) > 1 for question in analysis.questions
        ),
    }


def main() -> int:
    if not settings.OPENAI_API_KEY or not settings.OPENAI_API_KEY.strip():
        print("Acceptance stopped: OPENAI_API_KEY is not configured.")
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

    if row is None or row[1].id != EXPECTED_MEDIA_ASSET_ID:
        print("Acceptance stopped: immutable source metadata is unavailable.")
        return 3
    if not pages:
        print("Acceptance stopped: source page identities are unavailable.")
        return 3

    _, media_asset = row
    storage = LocalMediaStorage(settings.MEDIA_ROOT)
    try:
        with storage.open_key(media_asset.storage_key) as stream:
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
        print("Acceptance stopped: immutable source binary is unavailable.")
        return 3

    visual_pages = sum(
        page.visual_content is not None for page in raw_document.pages
    )
    text_pages = sum(bool(page.raw_text.strip()) for page in raw_document.pages)
    print(f"source_document_id={SOURCE_DOCUMENT_ID}")
    print(f"media_asset_id={media_asset.id}")
    print(f"page_count={len(raw_document.pages)}")
    print(f"raw_text_pages={text_pages}")
    print(f"visual_pages={visual_pages}")
    print(f"visual_render_failures={len(raw_document.pages) - visual_pages}")
    print(f"model={settings.OPENAI_DOCUMENT_ANALYSIS_MODEL}")

    request = build_document_analysis_request(raw_document)
    try:
        analysis = OpenAIDocumentAnalysisProvider(
            instructions=ACCEPTANCE_INSTRUCTIONS,
        ).analyze_document(request)
    except DocumentAnalysisProviderError as exc:
        print(f"OpenAI acceptance failed safely: {exc}")
        return 4

    summary = summarize_analysis(analysis)
    for key, value in summary.items():
        print(f"{key}={value}")
    for index, question in enumerate(analysis.questions, start=1):
        pages_text = ",".join(
            str(reference.page_number) for reference in question.source_pages
        )
        print(
            f"question[{index}]: number={question.question_number!r}; "
            f"variant={_variant_name(question.question_number)}; "
            f"pages={pages_text}; options={len(question.answer_options)}; "
            f"visual_required={question.visual_required}; "
            f"confidence={question.confidence}; "
            f"needs_review={question.needs_review}; "
            f"corrections={len(question.corrections)}; "
            f"text={question.question_text!r}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
