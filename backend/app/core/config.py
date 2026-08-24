from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE_PATH = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    """
    Application configuration loaded from environment variables and `.env`.

    Production secrets must never be committed to Git.
    """

    # Application
    APP_NAME: str = "AI Math Platform"
    APP_VERSION: str = "1.0.0"
    APP_ENV: Literal[
        "development",
        "testing",
        "staging",
        "production",
    ] = "development"
    DEBUG: bool = False

    # API
    API_V1_PREFIX: str = "/api/v1"

    # Local media ingestion
    MEDIA_ROOT: Path = PROJECT_ROOT / "backend" / "data" / "media"
    MEDIA_MAX_IMAGE_BYTES: int = Field(default=10 * 1024 * 1024, ge=1)
    MEDIA_MAX_IMAGE_PIXELS: int = Field(default=40_000_000, ge=1)
    MEDIA_MAX_SOURCE_BYTES: int = Field(default=10 * 1024 * 1024, ge=1)
    MEDIA_MAX_DOCX_MEMBERS: int = Field(default=1024, ge=1)
    MEDIA_MAX_DOCX_EXPANDED_BYTES: int = Field(
        default=10 * 1024 * 1024,
        ge=1,
    )

    # Source pre-analysis execution ownership
    SOURCE_PRE_ANALYSIS_LEASE_SECONDS: int = Field(
        default=900,
        ge=1,
        strict=True,
    )
    SOURCE_PRE_ANALYSIS_HEARTBEAT_SECONDS: int = Field(
        default=30,
        ge=1,
        strict=True,
    )
    SOURCE_PRE_ANALYSIS_RECOVERY_BATCH_SIZE: int = Field(
        default=10,
        ge=1,
        le=100,
        strict=True,
    )
    SOURCE_PRE_ANALYSIS_WORKER_BATCH_SIZE: int = Field(
        default=10,
        ge=1,
        le=100,
        strict=True,
    )
    QUESTION_EXTRACTION_WORKER_BATCH_SIZE: int = Field(
        default=10,
        ge=1,
        le=100,
        strict=True,
    )
    QUESTION_EXTRACTION_EXECUTION_MODE: Literal[
        "legacy",
        "document_analysis",
    ] = "legacy"

    # Database
    DATABASE_URL: str = Field(..., min_length=1)
    DATABASE_POOL_SIZE: int = Field(default=10, ge=1, le=100)
    DATABASE_MAX_OVERFLOW: int = Field(default=20, ge=0, le=100)
    DATABASE_POOL_TIMEOUT_SECONDS: int = Field(
        default=30,
        ge=1,
        le=300,
    )
    DATABASE_POOL_RECYCLE_SECONDS: int = Field(
        default=1800,
        ge=60,
    )

    # JWT access token
    JWT_SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: Literal["HS256", "HS384", "HS512"] = "HS256"
    JWT_ISSUER: str = "ai-math-platform"
    JWT_AUDIENCE: str = "ai-math-platform-api"
    JWT_CLOCK_SKEW_SECONDS: int = Field(
        default=30,
        ge=0,
        le=300,
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=15,
        ge=1,
        le=60,
    )

    # Refresh token
    REFRESH_TOKEN_HASH_KEY: str = Field(..., min_length=32)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=7,
        ge=1,
        le=90,
    )
    REFRESH_TOKEN_BYTES: int = Field(
        default=64,
        ge=32,
        le=128,
    )

    # Password security
    PASSWORD_MIN_LENGTH: int = Field(
        default=12,
        ge=8,
        le=128,
    )
    PASSWORD_MAX_LENGTH: int = Field(
        default=128,
        ge=32,
        le=1024,
    )

    # Authentication protection
    MAX_FAILED_LOGIN_ATTEMPTS: int = Field(
        default=5,
        ge=1,
        le=20,
    )
    ACCOUNT_LOCK_MINUTES: int = Field(
        default=15,
        ge=1,
        le=1440,
    )
    # Verification challenges
    VERIFICATION_CODE_LENGTH: int = Field(
        default=6,
        ge=4,
        le=10,
    )
    VERIFICATION_CODE_EXPIRE_MINUTES: int = Field(
        default=5,
        ge=1,
        le=30,
    )
    VERIFICATION_RESEND_COOLDOWN_SECONDS: int = Field(
        default=60,
        ge=30,
        le=600,
    )
    VERIFICATION_MAX_RESENDS: int = Field(
        default=5,
        ge=1,
        le=20,
    )
    VERIFICATION_MAX_FAILED_ATTEMPTS: int = Field(
        default=5,
        ge=1,
        le=20,
    )
    VERIFICATION_CODE_HASH_KEY: str = Field(
        ...,
        min_length=32,
    )
    # Session and device management
    MAX_ACTIVE_SESSIONS_PER_USER: int = Field(
        default=10,
        ge=1,
        le=100,
    )
    SESSION_INACTIVITY_EXPIRE_DAYS: int = Field(
        default=30,
        ge=1,
        le=365,
    )

    # Authentication cookies
    AUTH_COOKIE_SECURE: bool = False
    AUTH_COOKIE_HTTP_ONLY: bool = True
    AUTH_COOKIE_SAME_SITE: Literal[
        "lax",
        "strict",
        "none",
    ] = "lax"
    AUTH_COOKIE_DOMAIN: str | None = None
    AUTH_COOKIE_PATH: str = "/"
    REFRESH_TOKEN_COOKIE_NAME: str = "refresh_token"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True

    # External services
    OPENAI_API_KEY: str | None = None
    OPENAI_DOCUMENT_ANALYSIS_MODEL: str = "gpt-5-mini"
    OPENAI_DOCUMENT_ANALYSIS_TIMEOUT_SECONDS: float = Field(
        default=120.0,
        gt=0,
        le=600,
    )
    OPENAI_DOCUMENT_ANALYSIS_PROMPT_VERSION: str = "question-analysis-v2"
    OPENAI_DOCUMENT_ANALYSIS_PROCESSING_VERSION: str = "1"
    OPENAI_DOCUMENT_ANALYSIS_SCHEMA_VERSION: int = Field(
        default=1,
        ge=1,
        strict=True,
    )

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        validate_default=True,
    )

    @field_validator(
    "DATABASE_URL",
    "JWT_SECRET_KEY",
    "REFRESH_TOKEN_HASH_KEY",
    "VERIFICATION_CODE_HASH_KEY",
    "JWT_ISSUER",
    "JWT_AUDIENCE",
    mode="before",
)
    @classmethod
    def strip_required_strings(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()

        if not value:
            raise ValueError(
                "Bu konfiqurasiya dəyəri boş ola bilməz."
            )

        return value

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(
        cls,
        origins: list[str],
    ) -> list[str]:
        normalized_origins: list[str] = []

        for origin in origins:
            normalized_origin = origin.strip().rstrip("/")

            if not normalized_origin:
                continue

            if normalized_origin not in normalized_origins:
                normalized_origins.append(normalized_origin)

        if not normalized_origins:
            raise ValueError(
                "CORS_ORIGINS ən azı bir origin saxlamalıdır."
            )

        return normalized_origins

    @model_validator(mode="after")
    def validate_security_configuration(self) -> "Settings":
        insecure_secrets = {
            "CHANGE_THIS_IN_PRODUCTION",
            "change-me",
            "secret",
            "password",
        }

        if self.JWT_SECRET_KEY in insecure_secrets:
            raise ValueError(
                "JWT_SECRET_KEY təhlükəsiz, təsadüfi yaradılmış "
                "açar olmalıdır."
            )

        if self.REFRESH_TOKEN_HASH_KEY in insecure_secrets:
            raise ValueError(
                "REFRESH_TOKEN_HASH_KEY təhlükəsiz, təsadüfi "
                "yaradılmış açar olmalıdır."
            )
        if self.VERIFICATION_CODE_HASH_KEY in insecure_secrets:
            raise ValueError(
                "VERIFICATION_CODE_HASH_KEY təhlükəsiz, "
                "təsadüfi yaradılmış açar olmalıdır."
            )
        if self.JWT_SECRET_KEY == self.REFRESH_TOKEN_HASH_KEY:
            raise ValueError(
                "JWT_SECRET_KEY və REFRESH_TOKEN_HASH_KEY "
                "fərqli olmalıdır."
            )
        if self.VERIFICATION_CODE_HASH_KEY in {
            self.JWT_SECRET_KEY,
            self.REFRESH_TOKEN_HASH_KEY,
        }:
            raise ValueError(
                "VERIFICATION_CODE_HASH_KEY digər "
                "təhlükəsizlik açarlarından fərqli olmalıdır."
            )
        if (
            self.CORS_ALLOW_CREDENTIALS
            and "*" in self.CORS_ORIGINS
        ):
            raise ValueError(
                "Credentials aktiv olduqda CORS_ORIGINS "
                "daxilində '*' istifadə edilə bilməz."
            )

        if (
            self.AUTH_COOKIE_SAME_SITE == "none"
            and not self.AUTH_COOKIE_SECURE
        ):
            raise ValueError(
                "SameSite='none' olduqda "
                "AUTH_COOKIE_SECURE=true olmalıdır."
            )

        if (
            self.SOURCE_PRE_ANALYSIS_HEARTBEAT_SECONDS
            >= self.SOURCE_PRE_ANALYSIS_LEASE_SECONDS
        ):
            raise ValueError(
                "Source pre-analysis heartbeat interval must be shorter "
                "than its execution lease."
            )

        if self.APP_ENV == "production":
            if self.DEBUG:
                raise ValueError(
                    "Production mühitində DEBUG=false olmalıdır."
                )

            if not self.AUTH_COOKIE_SECURE:
                raise ValueError(
                    "Production mühitində "
                    "AUTH_COOKIE_SECURE=true olmalıdır."
                )

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
