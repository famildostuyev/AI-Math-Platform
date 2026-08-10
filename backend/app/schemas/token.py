from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    """
    Authentication token pair.

    The access token is a short-lived JWT.
    The refresh token is an opaque, rotating secret.
    """

    access_token: str = Field(
        ...,
        description="Short-lived JWT access token.",
    )

    refresh_token: str = Field(
        ...,
        description="Opaque refresh token.",
    )

    token_type: str = Field(
        default="Bearer",
        description="Authentication scheme.",
    )