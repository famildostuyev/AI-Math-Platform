from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """
    Login request using email or phone.
    """

    identifier: str = Field(
        ...,
        min_length=3,
        max_length=255,
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )


class RefreshTokenRequest(BaseModel):
    """
    Refresh access token request.
    """

    refresh_token: str = Field(
        ...,
        min_length=1,
    )


class TokenResponse(BaseModel):
    """
    JWT authentication response.
    """

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"