import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(SERVICE_ROOT / '.env', SERVICE_ROOT / f'.env.{os.getenv("NODE_ENV", "development")}'),
        extra='ignore', env_ignore_empty=True,
    )
    gemini_api_key: SecretStr = SecretStr('')
    gemini_model: str = Field(default='gemini-3.5-flash-lite', min_length=1, max_length=100)
    gemini_timeout_ms: int = Field(default=20000, ge=1000, le=60000)
    gemini_max_output_tokens: int = Field(default=8192, ge=1024, le=16384)
    ai_service_token: SecretStr = SecretStr('')

    @property
    def configured(self) -> bool:
        return bool(self.gemini_api_key.get_secret_value().strip()) and len(self.ai_service_token.get_secret_value()) >= 32


@lru_cache
def get_settings() -> Settings:
    return Settings()
