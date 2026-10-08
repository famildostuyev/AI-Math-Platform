from __future__ import annotations

import json
import math
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator, model_serializer
from pydantic.json_schema import SkipJsonSchema

from app.core.enums import (
    AnswerPolicy,
    ContentBlockType,
    QuestionDifficulty,
    QuestionRevisionStatus,
)
from app.schemas.question_answer import AcceptedAnswerRead, AnswerOptionRead
from app.schemas.question_solution import SolutionRead
from app.schemas.structured_text import StructuredTextDocument, InlineNode


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


class QuestionMetadataUpdate(StrictEditorSchema):
    """Omitted properties are unchanged; only difficulty may explicitly be null."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "anyOf": [{"required": ["question_type_id"]}, {"required": ["difficulty"]}],
    })
    question_type_id: uuid.UUID | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=lambda schema: schema.pop("default", None),
    )
    difficulty: QuestionDifficulty | None = None
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_timestamp(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)

    @model_validator(mode="after")
    def validate_patch(self) -> "QuestionMetadataUpdate":
        if not self.model_fields_set.intersection({"question_type_id", "difficulty"}):
            raise ValueError("At least one metadata property is required.")
        if "question_type_id" in self.model_fields_set and self.question_type_id is None:
            raise ValueError("Question type cannot be null.")
        return self


class QuestionMetadataRead(StrictEditorSchema):
    revision_id: uuid.UUID
    question_type_id: uuid.UUID
    difficulty: QuestionDifficulty | None
    updated_at: datetime
    answer_policy: AnswerPolicy


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
    # Missing role preserves legacy visible points; ownership uses primitive references.
    role: Literal["explicit", "implicit"] = "explicit"

    @model_serializer(mode="wrap")
    def serialize_optional_role(self, handler):
        data = handler(self)
        if "role" not in self.model_fields_set:
            data.pop("role", None)
        return data


class GeometrySegmentV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    start_point_id: str = Field(min_length=1, max_length=64)
    end_point_id: str = Field(min_length=1, max_length=64)


REGULAR_POLYGON_LIMITS = json.loads(Path(__file__).with_name('geometry_template_limits.json').read_text())


class GeometryPolygonTemplate(StrictEditorSchema):
    # Creation identity, deliberately not a promise of maintained constraints.
    kind: Literal["triangle", "right_triangle", "rectangle", "square", "parallelogram", "rhombus", "trapezoid"]


class GeometryRegularPolygonTemplate(StrictEditorSchema):
    kind: Literal["regular_polygon"]
    n: int = Field(strict=True, ge=REGULAR_POLYGON_LIMITS['minSides'], le=REGULAR_POLYGON_LIMITS['maxSides'])


class GeometryPolygonV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    point_ids: list[str] = Field(min_length=3)
    template: Annotated[Union[GeometryPolygonTemplate, GeometryRegularPolygonTemplate], Field(discriminator='kind')] | None = None

    @model_validator(mode="after")
    def validate_template(self):
        if self.template is None:
            if "template" in self.model_fields_set:
                raise ValueError("Geometry template metadata must be an object when present.")
            return self
        expected_vertices = self.template.n if isinstance(self.template, GeometryRegularPolygonTemplate) else 3 if self.template.kind in ("triangle", "right_triangle") else 4
        if len(self.point_ids) != expected_vertices:
            raise ValueError("Geometry template vertex count does not match its identity.")
        return self

    @model_serializer(mode="wrap")
    def serialize_template(self, handler):
        data = handler(self)
        if self.template is None:
            data.pop("template", None)
        return data

    @field_validator("point_ids")
    @classmethod
    def validate_distinct_vertices(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("Geometry polygon vertices must be distinct.")
        return values


class GeometryLineV1(GeometrySegmentV1):
    kind: Literal["line", "directed_line", "vector"]


class GeometryPolylineV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    point_ids: list[str] = Field(min_length=2, max_length=500)

    @field_validator("point_ids")
    @classmethod
    def validate_distinct_vertices(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("Geometry polyline vertices must be distinct.")
        return values


class GeometryAnnotationOffset(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float
    y: float


class GeometryAnnotationAttachment(StrictEditorSchema):
    target_kind: Literal["point", "segment", "polygon_edge", "circle", "arc", "shape"]
    target_id: str = Field(min_length=1, max_length=4096)
    start_point_id: str | None = Field(default=None, pattern=r'^[A-Za-z][A-Za-z0-9_-]{0,63}$')
    end_point_id: str | None = Field(default=None, pattern=r'^[A-Za-z][A-Za-z0-9_-]{0,63}$')
    auto_upright: bool | None = Field(default=None, strict=True)
    anchor: Literal["point", "parameter", "center"]
    parameter: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    offset: GeometryAnnotationOffset
    orientation: Literal["follow_target", "keep_page"]

    @model_validator(mode="after")
    def validate_anchor(self):
        parameter_target = self.target_kind in ("segment", "polygon_edge")
        expected = "point" if self.target_kind == "point" else "parameter" if parameter_target else "center"
        if self.anchor != expected or parameter_target != (self.parameter is not None):
            raise ValueError("Annotation anchor does not match its target kind.")
        if "parameter" in self.model_fields_set and self.parameter is None:
            raise ValueError("Explicit null parameter is unsupported.")
        if self.target_kind == "polygon_edge":
            if self.start_point_id is None or self.end_point_id is None or self.start_point_id == self.end_point_id:
                raise ValueError("Polygon edge requires distinct endpoint IDs.")
        elif {"start_point_id", "end_point_id"} & self.model_fields_set:
            raise ValueError("Endpoint IDs are only supported for polygon edges.")
        if "auto_upright" in self.model_fields_set and self.auto_upright is None:
            raise ValueError("Explicit null auto_upright is unsupported.")
        return self

    @model_serializer(mode="wrap")
    def serialize_parameter(self, handler):
        data = handler(self)
        if self.parameter is None:
            data.pop("parameter", None)
        for name in ("start_point_id", "end_point_id", "auto_upright"):
            if name not in self.model_fields_set:
                data.pop(name, None)
        return data


class GeometryTextV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    x: float
    y: float
    content: str = Field(min_length=1, max_length=500)
    runs: list[InlineNode] | None = Field(default=None, min_length=1, max_length=64)
    layout_width: float | None = Field(default=None, ge=0.1, le=10000)
    scale: float | None = Field(default=None, ge=0.01, le=100)
    rotation: float | None = None
    attachment: GeometryAnnotationAttachment | None = None

    @model_validator(mode="after")
    def validate_annotation(self):
        for name in ("runs", "layout_width", "scale", "rotation", "attachment"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"Explicit null {name} is unsupported.")
        if self.runs is not None:
            projected = ""
            for run in self.runs:
                if run.type == "text":
                    if run.marks:
                        raise ValueError("Annotation run styling is not supported.")
                    self.validate_plain_text(run.text) if run.text.strip() else None
                    projected += run.text
                elif run.type == "inline_math":
                    if not run.latex.strip():
                        raise ValueError("Annotation math must not be blank.")
                    projected += run.latex
                else:
                    projected += "\n"
            if projected != self.content:
                raise ValueError("Annotation content must equal its structured source projection.")
        return self

    @model_serializer(mode="wrap")
    def serialize_annotation(self, handler):
        data = handler(self)
        for name in ("runs", "layout_width", "scale", "rotation", "attachment"):
            if name not in self.model_fields_set:
                data.pop(name, None)
        return data

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


MIN_CIRCLE_RADIUS = json.loads(Path(__file__).with_name('geometry_circle_limits.json').read_text())['minimumRadius']


class GeometryCircleV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    center_point_id: str = Field(min_length=1, max_length=64)
    radius: float = Field(strict=True, gt=MIN_CIRCLE_RADIUS)
    kind: Literal["circle", "disk"]


MIN_ARC_SWEEP = json.loads(Path(__file__).with_name('geometry_arc_limits.json').read_text())['minimumSweepDegrees'] * math.pi / 180


class GeometryArcV1(StrictEditorSchema):
    # Radians: zero right, positive clockwise in Geometry's downward-y coordinates.
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    center_point_id: str = Field(min_length=1, max_length=64)
    radius: float = Field(strict=True, gt=MIN_CIRCLE_RADIUS)
    kind: Literal["arc", "sector"]
    start_angle: float = Field(strict=True, ge=0, lt=math.tau)
    sweep_angle: float = Field(strict=True, gt=MIN_ARC_SWEEP, lt=math.tau - MIN_ARC_SWEEP)


class GeometryMidpointConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")
    kind: Literal["midpoint"]
    source_point_ids: list[str] = Field(min_length=2, max_length=2)
    output_point_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_-]*$")

    @field_validator('source_point_ids')
    @classmethod
    def valid_sources(cls, values):
        import re
        if any(re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', value) is None for value in values):
            raise ValueError('Invalid construction point ID.')
        return values


class GeometryLinearSourceV1(StrictEditorSchema):
    kind: Literal['line', 'directed_line', 'segment', 'vector']
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometryLinearConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['parallel', 'perpendicular']
    source: GeometryLinearSourceV1
    through_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    output_line_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    support_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometryIntersectionConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['intersection']
    source_a: GeometryLinearSourceV1
    source_b: GeometryLinearSourceV1
    output_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometryAngleBisectorConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['angle_bisector']
    source_point_ids: list[str] = Field(min_length=3, max_length=3)
    output_line_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    support_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    intersection_point_id: str | None = Field(default=None, min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')

    @field_validator('intersection_point_id')
    @classmethod
    def valid_intersection(cls, value):
        if value is None:
            raise ValueError('Intersection ID must be omitted or reference a point.')
        return value

    @model_serializer(mode='wrap')
    def serialize_optional_intersection(self, handler):
        data = handler(self)
        if self.intersection_point_id is None:
            data.pop('intersection_point_id', None)
        return data

    @field_validator('source_point_ids')
    @classmethod
    def valid_sources(cls, values):
        import re
        if any(
            re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', value) is None
            for value in values
        ):
            raise ValueError('Invalid construction point ID.')
        if len(set(values)) != 3:
            raise ValueError('Angle bisector requires three distinct points.')
        return values


class GeometryAltitudeConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['altitude']
    source_point_ids: list[str] = Field(min_length=3, max_length=3)
    output_segment_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    foot_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')

    @field_validator('source_point_ids')
    @classmethod
    def valid_sources(cls, values):
        import re
        if len(set(values)) != 3 or any(re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', value) is None for value in values):
            raise ValueError('Altitude requires three distinct valid point IDs.')
        return values


class GeometryMedianConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['median']
    vertex_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    midpoint_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    output_segment_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometrySegmentPointParent(StrictEditorSchema):
    kind: Literal['segment']
    segment_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometryPolygonEdgePointParent(StrictEditorSchema):
    kind: Literal['polygon_edge']
    polygon_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    start_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    end_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometryPointOnSegmentConstructionV1(StrictEditorSchema):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')
    kind: Literal['point_on_segment']
    parent: Annotated[Union[GeometrySegmentPointParent, GeometryPolygonEdgePointParent], Field(discriminator='kind')]
    t: float = Field(strict=True, ge=0, le=1, allow_inf_nan=False)
    output_point_id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z][A-Za-z0-9_-]*$')


class GeometrySourceDataV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    schema_version: Literal[1]
    viewport: GeometryViewportV1
    description: str = Field(min_length=1, max_length=500)
    points: list[GeometryPointV1] = Field(default_factory=list, max_length=500)
    segments: list[GeometrySegmentV1] = Field(default_factory=list, max_length=1000)
    polygons: list[GeometryPolygonV1] = Field(default_factory=list, max_length=200)
    texts: list[GeometryTextV1] = Field(default_factory=list, max_length=500)
    lines: list[GeometryLineV1] = Field(default_factory=list, max_length=1000)
    polylines: list[GeometryPolylineV1] = Field(default_factory=list, max_length=200)
    circles: list[GeometryCircleV1] = Field(default_factory=list, max_length=200)
    arcs: list[GeometryArcV1] = Field(default_factory=list, max_length=200)
    constructions: list[GeometryMidpointConstructionV1 | GeometryLinearConstructionV1 | GeometryIntersectionConstructionV1 | GeometryAngleBisectorConstructionV1 | GeometryAltitudeConstructionV1 | GeometryMedianConstructionV1 | GeometryPointOnSegmentConstructionV1] = Field(default_factory=list, max_length=200)

    @model_serializer(mode="wrap")
    def serialize_additive_collections(self, handler):
        data = handler(self)
        for name in ("lines", "polylines", "circles", "arcs", "constructions"):
            if name not in self.model_fields_set and not getattr(self, name):
                data.pop(name, None)
        return data

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
        all_ids.extend(line.id for line in self.lines)
        all_ids.extend(polyline.id for polyline in self.polylines)
        all_ids.extend(circle.id for circle in self.circles)
        all_ids.extend(arc.id for arc in self.arcs)
        all_ids.extend(construction.id for construction in self.constructions)
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("Geometry object IDs must be unique.")

        point_ids = {point.id for point in self.points}
        for text in self.texts:
            a = text.attachment
            if a is not None and a.target_kind == "polygon_edge":
                polygon = next((p for p in self.polygons if p.id == a.target_id), None)
                # Missing targets retain the existing non-destructive fallback.
                if polygon is not None:
                    pairs = {(polygon.point_ids[i], polygon.point_ids[(i + 1) % len(polygon.point_ids)]) for i in range(len(polygon.point_ids))}
                    if (a.start_point_id, a.end_point_id) not in pairs and (a.end_point_id, a.start_point_id) not in pairs:
                        raise ValueError("Annotation references a nonadjacent polygon edge.")
        for arc in self.arcs:
            if arc.center_point_id not in point_ids:
                raise ValueError("Geometry arc references an unknown center point.")
        for circle in self.circles:
            if circle.center_point_id not in point_ids:
                raise ValueError("Geometry circle references an unknown center point.")
        for segment in self.segments:
            if segment.start_point_id not in point_ids or segment.end_point_id not in point_ids:
                raise ValueError("Geometry segment references an unknown point.")
            if segment.start_point_id == segment.end_point_id:
                raise ValueError("Geometry segment endpoints must be distinct.")
        for polygon in self.polygons:
            if not set(polygon.point_ids).issubset(point_ids):
                raise ValueError("Geometry polygon references an unknown point.")
        points = {point.id: point for point in self.points}
        for line in self.lines:
            a, b = points.get(line.start_point_id), points.get(line.end_point_id)
            if a is None or b is None or a.id == b.id or (a.x == b.x and a.y == b.y):
                raise ValueError("Geometry line requires two distinct known locations.")
        for polyline in self.polylines:
            if not set(polyline.point_ids).issubset(point_ids):
                raise ValueError("Geometry polyline references an unknown point.")
            vertices = [points[id] for id in polyline.point_ids]
            if any(a.x == b.x and a.y == b.y for a, b in zip(vertices, vertices[1:])):
                raise ValueError("Geometry polyline consecutive locations must be distinct.")
        from app.schemas.geometry_constructions import validate_constructions
        validate_constructions(self.points, self.constructions, self.segments, self.lines, self.polygons)
        return self


class VisualPositionV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    unit: Literal["px"] = "px"


class VisualSizeV1(StrictEditorSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    unit: Literal["px"] = "px"


class VisualDocumentAnchorV1(StrictEditorSchema):
    kind: Literal["document"] = "document"


class VisualPlacementV1(StrictEditorSchema):
    """Document CSS pixels at 100% zoom; content coordinates are independent."""
    version: Literal[1] = 1
    layoutMode: Literal["floating"] = "floating"
    anchor: VisualDocumentAnchorV1
    position: VisualPositionV1
    size: VisualSizeV1


class VisualPlacementUpdate(StrictEditorSchema):
    visual_placement: VisualPlacementV1
    expected_revision_updated_at: datetime

    @field_validator("expected_revision_updated_at")
    @classmethod
    def validate_timestamp(cls, value: datetime) -> datetime:
        return _require_aware_datetime(value)


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
    visual_placement: VisualPlacementV1 | None = None
    id: uuid.UUID
    block_type: Literal[ContentBlockType.IMAGE]
    sort_order: int = Field(ge=0)
    payload: ImageBlockPayloadRead


class GeometryBlockRead(StrictEditorSchema):
    visual_placement: VisualPlacementV1 | None = None
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
    visual_placement: VisualPlacementV1 | None = None
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
    visual_placement: VisualPlacementV1 | None = None
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
