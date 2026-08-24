from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.question_extraction_run import QuestionExtractionRun


class QuestionExtractionResult(BaseModel):
    """Immutable processor and AI provenance for one successful extraction run."""

    __tablename__ = "question_extraction_results"

    __table_args__ = (
        CheckConstraint(
            "schema_version > 0",
            name="ck_question_extraction_results_schema_version_positive",
        ),
        CheckConstraint(
            "char_length(btrim(processor_name)) > 0",
            name="ck_question_extraction_results_processor_name_nonblank",
        ),
        CheckConstraint(
            "char_length(btrim(processor_version)) > 0",
            name="ck_question_extraction_results_processor_version_nonblank",
        ),
        CheckConstraint(
            "provider_name IS NULL OR char_length(btrim(provider_name)) > 0",
            name="ck_question_extraction_results_provider_name_nonblank",
        ),
        CheckConstraint(
            "model_name IS NULL OR char_length(btrim(model_name)) > 0",
            name="ck_question_extraction_results_model_name_nonblank",
        ),
        CheckConstraint(
            "prompt_version IS NULL OR char_length(btrim(prompt_version)) > 0",
            name="ck_question_extraction_results_prompt_version_nonblank",
        ),
        CheckConstraint(
            "char_length(btrim(processing_version)) > 0",
            name="ck_question_extraction_results_processing_version_nonblank",
        ),
        UniqueConstraint(
            "question_extraction_run_id",
            name="uq_question_extraction_results_run_id",
        ),
    )

    question_extraction_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_extraction_runs.id", ondelete="RESTRICT"),
        nullable=False,
    )

    schema_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )

    processor_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    processor_version: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    provider_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    model_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    prompt_version: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    processing_version: Mapped[str] = mapped_column(
        String(100),
        default="1",
        server_default=text("'1'"),
        nullable=False,
    )

    analysis_data: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )

    question_extraction_run: Mapped["QuestionExtractionRun"] = relationship(
        "QuestionExtractionRun",
        foreign_keys=[question_extraction_run_id],
    )
