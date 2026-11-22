from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    poll_interval_seconds: float = Field(default=1.0, ge=1)
    gdansk_api_timeout_seconds: float = Field(default=5.0, gt=0)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    redis_url: str | None = None
    database_url: str | None = None
    live_tick_seconds: float = Field(default=1.0, ge=0.2)
    overview_interval_seconds: float = Field(default=5.0, ge=1)
    detail_min_zoom: float = Field(default=13.0, ge=0, le=22)
    snap_max_distance_m: float = Field(default=75.0, ge=0)
    interpolation_mode: Literal["damped", "snap"] = "damped"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
