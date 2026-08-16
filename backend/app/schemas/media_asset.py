from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MediaAssetRead(BaseModel):
    """Public metadata for one ingested media asset."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    original_filename: str | None
    mime_type: str
    size_bytes: int
    width_px: int | None
    height_px: int | None
    created_at: datetime
