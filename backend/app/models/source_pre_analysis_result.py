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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.source_pre_analysis_run import SourcePreAnalysisRun


class SourcePreAnalysisResult(BaseModel):
    """Immutable result identity and page summary for one successful run."""

    __tablename__ = "source_pre_analysis_results"

    __table_args__ = (
        CheckConstraint(
            "schema_version > 0",
            name="ck_source_pre_analysis_results_schema_version_positive",
        ),
        CheckConstraint(
            "page_count IS NULL OR page_count >= 0",
            name="ck_source_pre_analysis_results_page_count_non_negative",
        ),
        CheckConstraint(
            "(processor_name IS NULL AND processor_version IS NULL) OR "
            "(processor_name IS NOT NULL AND processor_version IS NOT NULL)",
            name="ck_source_pre_analysis_results_processor_identity_paired",
        ),
        CheckConstraint(
            "processor_name IS NULL OR "
            "char_length(btrim(processor_name)) > 0",
            name="ck_source_pre_analysis_results_processor_name_nonblank",
        ),
        CheckConstraint(
            "processor_version IS NULL OR "
            "char_length(btrim(processor_version)) > 0",
            name="ck_source_pre_analysis_results_processor_version_nonblank",
        ),
        CheckConstraint(
            "provider_name IS NULL OR "
            "char_length(btrim(provider_name)) > 0",
            name="ck_source_pre_analysis_results_provider_name_nonblank",
        ),
        CheckConstraint(
            "model_name IS NULL OR char_length(btrim(model_name)) > 0",
            name="ck_source_pre_analysis_results_model_name_nonblank",
        ),
        CheckConstraint(
            "prompt_version IS NULL OR "
            "char_length(btrim(prompt_version)) > 0",
            name="ck_source_pre_analysis_results_prompt_version_nonblank",
        ),
        UniqueConstraint(
            "source_pre_analysis_run_id",
            name="uq_source_pre_analysis_results_run_id",
        ),
    )

    source_pre_analysis_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_pre_analysis_runs.id", ondelete="RESTRICT"),
        nullable=False,
    )

    schema_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )

    page_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    processor_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    processor_version: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
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

    source_pre_analysis_run: Mapped["SourcePreAnalysisRun"] = relationship(
        "SourcePreAnalysisRun",
        foreign_keys=[source_pre_analysis_run_id],
    )
