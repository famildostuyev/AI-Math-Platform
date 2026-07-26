from dotenv import load_dotenv
import os

load_dotenv()


class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # JWT
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY",
        "CHANGE_THIS_IN_PRODUCTION",
    )

    JWT_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    REFRESH_TOKEN_EXPIRE_DAYS: int = 7


settings = Settings()


if not settings.DATABASE_URL:
    raise ValueError(
        "DATABASE_URL tapÄ±lmadÄ±. .env faylÄ±nÄ± yoxlayÄ±n."
    )
