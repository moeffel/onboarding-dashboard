"""Application configuration using pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "Onboarding Dashboard"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-strong-random-key"

    # Database
    database_url: str = "sqlite+aiosqlite:///./onboarding.db"

    # PostgreSQL connection pool settings (used when DATABASE_URL is postgres)
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30

    # Session
    session_cookie_name: str = "session"
    session_max_age: int = 3600 * 8  # 8 hours

    # Security
    bcrypt_rounds: int = 12
    rate_limit_login: str = "5/minute"
    csrf_token_expiry: int = 3600  # 1 hour

    # CORS (for development)
    cors_origins: list[str] = ["http://localhost:5173"]

    # Data retention
    data_retention_days: int = 365 * 2  # 2 years default


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
