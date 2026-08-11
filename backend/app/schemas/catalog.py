import uuid

from pydantic import BaseModel, ConfigDict


class GradeCatalogResponse(BaseModel):
    """Public read model for an active grade catalog entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    sort_order: int
