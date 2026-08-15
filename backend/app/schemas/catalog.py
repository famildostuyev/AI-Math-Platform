import uuid

from pydantic import BaseModel, ConfigDict


class GradeCatalogResponse(BaseModel):
    """Public read model for an active grade catalog entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    sort_order: int


class PurposeCatalogResponse(BaseModel):
    """Public read model for an active purpose catalog entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    description: str | None
    sort_order: int
    parent_id: uuid.UUID | None


class QuestionTypeCatalogResponse(BaseModel):
    """Public read model for an active question-type catalog entry."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    description: str | None
    sort_order: int
