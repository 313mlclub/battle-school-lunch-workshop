from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    neis_api_key: str = Field(min_length=1)
    neis_base_url: AnyHttpUrl = "https://open.neis.go.kr/hub"
    neis_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    neis_page_size: int = Field(default=100, ge=1, le=1000)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
