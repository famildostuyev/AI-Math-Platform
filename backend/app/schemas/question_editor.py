from __future__ import annotations

import json
import math
import re
import uuid
from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.enums import (
    AnswerPolicy,
    ContentBlockType,
    QuestionDifficulty,
    QuestionRevisionStatus,
)
from app.schemas.question_answer import AcceptedAnswerRead, AnswerOptionRead
from app.schemas.question_solution import SolutionRead
from app.schemas.structured_text import StructuredTextDocument


class StrictEditorSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


_GEOMETRY_MAX_JSON_BYTES = 1_048_576
_GEOMETRY_MAX_JSON_DEPTH = 32


def _validate_geometry_source_data(value: object) -> object:
    """Require JSON values; the outer object has container depth one."""

    if not isinstance(value, dict):
        raise ValueError("Geometry source_data must be a JSON object.")
    stack: list[tuple[object, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        if isinstance(current, dict):
            if depth > _GEOMETRY_MAX_JSON_DEPTH:
                raise ValueError("Geometry source_data exceeds maximum depth.")
            for key, nested in current.items():
                if not isinstance(key, str):
                    raise ValueError("Geometry JSON object keys must be strings.")
                stack.append((nested, depth + 1))
        elif isinstance(current, list):
            if depth > _GEOMETRY_MAX_JSON_DEPTH:
                raise ValueError("Geometry source_data exceeds maximum depth.")
            stack.extend((nested, depth + 1) for nested in current)
        elif isinstance(current, float):
            if not math.isfinite(current):
                raise ValueError("Geometry source_data numbers must be finite.")
        elif current is None or isinstance(current, (str, int, bool)):
            continue
        else:
            raise ValueError("Geometry source_data must contain only JSON values.")

    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Geometry source_data is not valid JSON.") from exc
    if len(encoded) > _GEOMETRY_MAX_JSON_BYTES:
        raise ValueError("Geometry source_data exceeds maximum encoded size.")
    return value


def _require_unique_ids(values: list[uuid.UUID], field_name: str) -> list[uuid.UUID]:
    if len(values) != len(set(values)):
        raise ValueError(f"{field_name} must contain unique IDs.")
    return values


def _require_aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Concurrency timestamp must include a timezone.")
    return value


class QuestionDraftCreate(StrictEditorSchema):
    question_type_id: uuid.UUID
    primary_topic_id: uuid.UUID | None = None
    related_topic_ids: list[uuid.UUID] = Field(default_factory=list)
    purpose_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("related_topic_ids")
    @classmethod
    def validate_related_topic_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "related_topic_ids")

    @field_validator("purpose_ids")
    @classmethod
    def validate_purpose_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "purpose_ids")

    @model_validator(mode="after")
    def reject_primary_topic_as_related(self) -> "QuestionDraftCreate":
        if (
            self.primary_topic_id is not None
            and self.primary_topic_id in self.related_topic_ids
        ):
            raise ValueError("Primary topic cannot also be a related topic.")
        return self


class QuestionDraftRead(StrictEditorSchema):
    question_family_id: uuid.UUID
    question_form_id: uuid.UUID
    revision_id: uuid.UUID
    revision_number: int = Field(gt=0)
    status: QuestionRevisionStatus
    question_type_id: uuid.UUID
    source_id: uuid.UUID | None
    source_detail: str | None
    source_display_name: str | None
    primary_topic_id: uuid.UUID | None
    related_topic_ids: list[uuid.UUID]
    purpose_ids: list[uuid.UUID]
    difficulty: QuestionDifficulty | None
    updated_at: datetime

    @field_validator("updated_at")
    @classmethod
    def validate_updated_at(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)


class TextBlockPayloadRead(StrictEditorSchema):
    source_text: str
    document: StructuredTextDocument
    format_version: Literal[1]


class FormulaBlockPayloadRead(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1]


class ImageBlockPayloadRead(StrictEditorSchema):
    media_asset_id: uuid.UUID
    alt_text: str | None


class GeometryBlockPayloadRead(StrictEditorSchema):
    source_data: dict[str, object]
    format_version: Literal[1]


class GeometryViewportV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    min_x: float
    min_y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class GeometryPointV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    x: float
    y: float
    label: str | None = Field(default=None, min_length=1, max_length=100)


class GeometrySegmentV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    start_point_id: str = Field(min_length=1, max_length=64)
    end_point_id: str = Field(min_length=1, max_length=64)


class GeometryPolygonV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    point_ids: list[str] = Field(min_length=3)

    @field_validator("point_ids")
    @classmethod
    def validate_distinct_vertices(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("Geometry polygon vertices must be distinct.")
        return values


class GeometryTextV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    x: float
    y: float
    content: str = Field(min_length=1, max_length=500)

    @field_validator("content")
    @classmethod
    def validate_plain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Geometry text content must not be blank.")
        if re.search(r"<\s*/?\s*[A-Za-z][^>]*>", value) or re.search(
            r"javascript\s*:", value, flags=re.IGNORECASE,
        ):
            raise ValueError("Geometry text content must be plain text.")
        return value


class GeometrySourceDataV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    schema_version: Literal[1]
    viewport: GeometryViewportV1
    description: str = Field(min_length=1, max_length=500)
    points: list[GeometryPointV1] = Field(default_factory=list, max_length=500)
    segments: list[GeometrySegmentV1] = Field(default_factory=list, max_length=1000)
    polygons: list[GeometryPolygonV1] = Field(default_factory=list, max_length=200)
    texts: list[GeometryTextV1] = Field(default_factory=list, max_length=500)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Geometry description must not be blank.")
        return value

    @model_validator(mode="after")
    def validate_object_graph(self) -> "GeometrySourceDataV1":
        all_ids = [point.id for point in self.points]
        all_ids.extend(segment.id for segment in self.segments)
        all_ids.extend(polygon.id for polygon in self.polygons)
        all_ids.extend(text.id for text in self.texts)
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("Geometry object IDs must be unique.")

        point_ids = {point.id for point in self.points}
        for segment in self.segments:
            if segment.start_point_id not in point_ids or segment.end_point_id not in point_ids:
                raise ValueError("Geometry segment references an unknown point.")
            if segment.start_point_id == segment.end_point_id:
                raise ValueError("Geometry segment endpoints must be distinct.")
        for polygon in self.polygons:
            if not set(polygon.point_ids).issubset(point_ids):
                raise ValueError("Geometry polygon references an unknown point.")
        return self


class TextBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.TEXT]
    sort_order: int = Field(ge=0)
    payload: TextBlockPayloadRead


class FormulaBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.FORMULA]
    sort_order: int = Field(ge=0)
    payload: FormulaBlockPayloadRead


class ImageBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.IMAGE]
    sort_order: int = Field(ge=0)
    payload: ImageBlockPayloadRead


class GeometryBlockRead(StrictEditorSchema):
    id: uuid.UUID
    block_type: Literal[ContentBlockType.GEOMETRY]
    sort_order: int = Field(ge=0)
    payload: GeometryBlockPayloadRead


ContentBlockRead = Annotated[
    Union[TextBlockRead, FormulaBlockRead, ImageBlockRead, GeometryBlockRead],
    Field(discriminator="block_type"),
]


class QuestionRevisionEditorRead(QuestionDraftRead):
    blocks: list[ContentBlockRead]
    answer_policy: AnswerPolicy = AnswerPolicy.UNSUPPORTED
    answer_options: list[AnswerOptionRead] = Field(default_factory=list)
    accepted_answers: list[AcceptedAnswerRead] = Field(default_factory=list)
    solution: SolutionRead | None = None


class TextBlockWritePayload(StrictEditorSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1


class FormulaBlockWritePayload(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1] = 1


class ImageBlockWritePayload(StrictEditorSchema):
    media_asset_id: uuid.UUID
    alt_text: str | None


class GeometryBlockWritePayload(StrictEditorSchema):
    source_data: GeometrySourceDataV1
    format_version: Literal[1] = 1

    @field_validator("source_data", mode="before")
    @classmethod
    def validate_source_data(cls, value: object) -> object:
        return _validate_geometry_source_data(value)


class TextBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.TEXT]
    payload: TextBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class FormulaBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.FORMULA]
    payload: FormulaBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class ImageBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.IMAGE]
    payload: ImageBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class GeometryBlockCreate(StrictEditorSchema):
    block_type: Literal[ContentBlockType.GEOMETRY]
    payload: GeometryBlockWritePayload
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


ContentBlockCreate = Annotated[
    Union[
        TextBlockCreate,
        FormulaBlockCreate,
        ImageBlockCreate,
        GeometryBlockCreate,
    ],
    Field(discriminator="block_type"),
]


class TextBlockUpdate(StrictEditorSchema):
    document: StructuredTextDocument
    format_version: Literal[1] = 1
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class FormulaBlockUpdate(StrictEditorSchema):
    source_latex: str
    format_version: Literal[1] = 1
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class ImageBlockUpdate(StrictEditorSchema):
    media_asset_id: uuid.UUID
    alt_text: str | None
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


class GeometryBlockUpdate(StrictEditorSchema):
    source_data: GeometrySourceDataV1
    format_version: Literal[1] = 1
    expected_revision_updated_at: datetime

    @field_validator("source_data", mode="before")
    @classmethod
    def validate_source_data(cls, value: object) -> object:
        return _validate_geometry_source_data(value)

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)


ContentBlockUpdate = Union[
    TextBlockUpdate,
    FormulaBlockUpdate,
    ImageBlockUpdate,
    GeometryBlockUpdate,
]


class BlockOrderRequest(StrictEditorSchema):
    block_ids: list[uuid.UUID]
    expected_revision_updated_at: datetime

    @field_validator("block_ids")
    @classmethod
    def validate_block_ids(
        cls, values: list[uuid.UUID],
    ) -> list[uuid.UUID]:
        return _require_unique_ids(values, "block_ids")

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_expected_revision_updated_at(
        cls, value: datetime,
    ) -> datetime:
        return _require_aware_datetime(value)

