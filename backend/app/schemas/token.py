from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    """
    Authentication token response.
    """

    access_token: str = Field(
        ...,
        description="JWT access token.",
    )

    refresh_token: str = Field(
        ...,
        description="JWT refresh token.",
    )

    token_type: str = Field(
        default="Bearer",
        description="Authentication scheme.",
    )


class AccessTokenResponse(BaseModel):
    """
    Access token response.
    """

    access_token: str = Field(
        ...,
        description="JWT access token.",
    )

    token_type: str = Field(
        default="Bearer",
        description="Authentication scheme.",
    )
