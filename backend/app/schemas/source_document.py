from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StrictSourceDocumentSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class SourceDocumentMediaAssetRead(StrictSourceDocumentSchema):
    id: uuid.UUID
    original_filename: str | None
    mime_type: str
    size_bytes: int
    width_px: int | None
    height_px: int | None
    created_at: datetime


class SourceDocumentRead(StrictSourceDocumentSchema):
    id: uuid.UUID
    media_asset_id: uuid.UUID
    question_source_id: uuid.UUID | None
    uploaded_by_user_id: uuid.UUID | None
    created_at: datetime
    media_asset: SourceDocumentMediaAssetRead
