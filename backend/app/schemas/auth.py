from enum import StrEnum
import re
import uuid
from pydantic import BaseModel, Field, field_validator, model_validator


_EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

_PHONE_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")


class RegisterAccountType(StrEnum):
    """
    Account types available through public registration.

    Administrator accounts are excluded because they must be created
    through a controlled internal process.
    """

    STUDENT = "student"
    PARENT = "parent"
    TEACHER = "teacher"


class RegisterRequest(BaseModel):
    """
    Public user-registration request.

    A user must choose a student, parent, or teacher account type.
    At least one unique identifier must be supplied: an email address
    or an international-format phone number.
    """

    first_name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="User first name.",
        examples=["John"],
    )

    last_name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="User last name.",
        examples=["Doe"],
    )

    account_type: RegisterAccountType = Field(
        ...,
        description=(
            "Account type selected during public registration. "
            "Supported values are student, parent, and teacher."
        ),
        examples=["student"],
    )

    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=255,
        description="User email address.",
        examples=["student@example.com"],
    )

    phone_number: str | None = Field(
        default=None,
        min_length=8,
        max_length=16,
        description=(
            "User phone number in international E.164 format, "
            "for example +994501234567."
        ),
        examples=["+994501234567"],
    )

    password: str = Field(
        ...,
        min_length=12,
        max_length=128,
        description=(
            "Strong password containing uppercase, lowercase, "
            "numeric, and special characters."
        ),
        examples=["StrongPassword123!"],
    )

    device_name: str | None = Field(
        default=None,
        max_length=150,
        description="Optional human-readable device name.",
        examples=["Windows PC"],
    )

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized_name = " ".join(value.strip().split())

        if not normalized_name:
            raise ValueError("Name cannot be empty.")

        return normalized_name

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: object) -> object:
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        normalized_email = value.strip().lower()

        if not normalized_email:
            return None

        if not _EMAIL_PATTERN.fullmatch(normalized_email):
            raise ValueError("Invalid email address.")

        return normalized_email

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone_number(cls, value: object) -> object:
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        normalized_phone_number = re.sub(
            r"[\s\-()]",
            "",
            value.strip(),
        )

        if not normalized_phone_number:
            return None

        if not _PHONE_PATTERN.fullmatch(normalized_phone_number):
            raise ValueError(
                "Phone number must be in international E.164 format."
            )

        return normalized_phone_number

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if password != password.strip():
            raise ValueError(
                "Password cannot contain leading or trailing whitespace."
            )

        if not re.search(r"[a-z]", password):
            raise ValueError(
                "Password must contain at least one lowercase letter."
            )

        if not re.search(r"[A-Z]", password):
            raise ValueError(
                "Password must contain at least one uppercase letter."
            )

        if not re.search(r"\d", password):
            raise ValueError(
                "Password must contain at least one number."
            )

        if not re.search(r"[^A-Za-z0-9]", password):
            raise ValueError(
                "Password must contain at least one special character."
            )

        return password

    @field_validator("device_name", mode="before")
    @classmethod
    def normalize_device_name(cls, value: object) -> object:
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        normalized_device_name = " ".join(value.strip().split())

        return normalized_device_name or None

    @model_validator(mode="after")
    def validate_registration_identifier(self) -> "RegisterRequest":
        if self.email is None and self.phone_number is None:
            raise ValueError(
                "An email address or phone number must be provided."
            )

        return self


class RegisterResponse(BaseModel):
    """
    Response returned after successful public user registration.
    """

    user_id: uuid.UUID
    challenge_id: uuid.UUID
    first_name: str
    last_name: str
    account_type: RegisterAccountType
    email: str | None = None
    phone_number: str | None = None
    is_active: bool
    message: str = "User registered successfully."


class LoginRequest(BaseModel):
    """
    Login request using an email address or phone number.
    """

    identifier: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="User email address or phone number.",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password.",
    )

    device_name: str | None = Field(
        default=None,
        max_length=150,
        description="Optional human-readable device name.",
    )

    @field_validator("identifier", mode="before")
    @classmethod
    def normalize_identifier(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized_identifier = value.strip()

        if "@" in normalized_identifier:
            normalized_identifier = normalized_identifier.lower()
        else:
            normalized_identifier = re.sub(
                r"[\s\-()]",
                "",
                normalized_identifier,
            )

        if not normalized_identifier:
            raise ValueError(
                "An email address or phone number must be provided."
            )

        return normalized_identifier

    @field_validator("device_name", mode="before")
    @classmethod
    def normalize_login_device_name(cls, value: object) -> object:
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        normalized_device_name = " ".join(value.strip().split())

        return normalized_device_name or None


class RefreshTokenRequest(BaseModel):
    """
    Refresh-token rotation request.
    """

    refresh_token: str = Field(
        ...,
        min_length=32,
        max_length=512,
        description="Opaque refresh token.",
    )

    device_name: str | None = Field(
        default=None,
        max_length=150,
        description="Optional updated device name.",
    )

    @field_validator("refresh_token", mode="before")
    @classmethod
    def normalize_refresh_token(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized_token = value.strip()

        if not normalized_token:
            raise ValueError("Refresh token cannot be empty.")

        return normalized_token

    @field_validator("device_name", mode="before")
    @classmethod
    def normalize_refresh_device_name(cls, value: object) -> object:
        if value is None:
            return None

        if not isinstance(value, str):
            return value

        normalized_device_name = " ".join(value.strip().split())

        return normalized_device_name or None


class LogoutResponse(BaseModel):
    """
    Response returned after revoking the current session.
    """

    revoked: bool


class LogoutAllResponse(BaseModel):
    """
    Response returned after revoking user sessions.
    """

    revoked_sessions: int = Field(..., ge=0)


class VerifyRequest(BaseModel):
    """
    Verification request containing a challenge identifier and code.
    """

    challenge_id: uuid.UUID = Field(
        ...,
        description="Verification challenge identifier.",
    )

    code: str = Field(
        ...,
        min_length=4,
        max_length=10,
        description="Verification code.",
    )

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized_code = value.strip()

        if not normalized_code:
            raise ValueError("Verification code cannot be empty.")

        return normalized_code


class VerifyResponse(BaseModel):
    """
    Response returned after successful verification.
    """

    success: bool
    message: str