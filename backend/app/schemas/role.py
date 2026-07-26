from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoleBase(BaseModel):
    """
    Base role schema.
    """

    name: str = Field(
        ...,
        max_length=100,
        description="Unique role name.",
    )

    display_name: str = Field(
        ...,
        max_length=150,
        description="Human-readable role name.",
    )

    description: str | None = Field(
        default=None,
        description="Role description.",
    )


class RoleCreate(RoleBase):
    """
    Schema for creating a role.
    """

    pass


class RoleUpdate(BaseModel):
    """
    Schema for updating a role.
    """

    display_name: str | None = Field(
        default=None,
        max_length=150,
    )

    description: str | None = None

    is_active: bool | None = None


class RoleResponse(RoleBase):
    """
    Role response schema.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID

    is_system: bool

    is_active: bool
