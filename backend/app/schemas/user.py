from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    """
    Base user schema.
    """

    email: EmailStr | None = Field(
        default=None,
        description="User email address.",
    )

    phone: str | None = Field(
        default=None,
        max_length=20,
        description="User phone number.",
    )


class UserCreate(UserBase):
    """
    Schema for creating a user.
    """

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password.",
    )


class UserUpdate(BaseModel):
    """
    Schema for updating user profile.
    """

    email: EmailStr | None = None

    phone: str | None = None


class UserResponse(UserBase):
    """
    User response schema.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID

    is_email_verified: bool

    is_phone_verified: bool

    is_active: bool
