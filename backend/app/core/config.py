from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables and .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "git_out"
    mongodb_server_selection_timeout_ms: int = Field(default=1000, ge=100)
    environment: str = "development"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings."""

    return Settings()
