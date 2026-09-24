from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    poll_interval_seconds: float = 12.0
    gdansk_api_timeout_seconds: float = 5.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
