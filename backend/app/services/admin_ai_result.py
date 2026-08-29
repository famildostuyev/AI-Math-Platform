from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


from app.core.enums import AdminAIResultKind


class CapabilityClassification(str, Enum):
    READ_ONLY = "read_only"
    MUTATION_PREPARATION = "mutation_preparation"


class CapabilityEffectScope(str, Enum):
    NONE = "none"
    REVISION = "revision"
    NEW_QUESTION = "new_question"


class StrictFrozenAdminAIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AdminAISourceSnapshot(StrictFrozenAdminAIModel):
    entity_type: str = Field(min_length=1, max_length=100)
    entity_id: uuid.UUID
    updated_at: datetime | None = None


class AdminAIWarning(StrictFrozenAdminAIModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,99}$")
    message: str = Field(min_length=1, max_length=500)


class AdminAICapabilityResult(StrictFrozenAdminAIModel):
    capability_name: str = Field(pattern=r"^[a-z][a-z0-9_.]{0,99}$")
    capability_version: int = Field(gt=0)
    classification: CapabilityClassification
    effect_scope: CapabilityEffectScope
    payload: dict[str, object]


class AdminAIResultEnvelope(StrictFrozenAdminAIModel):
    schema_version: Literal[1] = 1
    result_kind: AdminAIResultKind
    capability_results: tuple[AdminAICapabilityResult, ...] = ()
    source_snapshots: tuple[AdminAISourceSnapshot, ...] = ()
    warnings: tuple[AdminAIWarning, ...] = ()
    unsupported_reason: str | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def result_shape_matches_kind(self) -> "AdminAIResultEnvelope":
        if self.result_kind == AdminAIResultKind.UNSUPPORTED:
            if self.capability_results or self.unsupported_reason is None:
                raise ValueError("Unsupported results require only a safe reason.")
            return self
        if self.unsupported_reason is not None:
            raise ValueError("Supported results cannot include an unsupported reason.")
        if not self.capability_results:
            if self.result_kind != AdminAIResultKind.INFORMATIONAL:
                raise ValueError("Mutation proposals require capability results.")
            return self
        classifications = {item.classification for item in self.capability_results}
        if self.result_kind == AdminAIResultKind.INFORMATIONAL:
            if classifications != {CapabilityClassification.READ_ONLY}:
                raise ValueError("Informational results may contain only read-only capabilities.")
        elif CapabilityClassification.MUTATION_PREPARATION not in classifications:
            raise ValueError("Mutation proposals require a mutation-preparation capability.")
        return self


class InformationalCapabilityPayload(StrictFrozenAdminAIModel):
    summary: str = Field(min_length=1, max_length=20_000)


def admin_ai_result_hash(envelope: AdminAIResultEnvelope) -> str:
    encoded = json.dumps(
        envelope.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
