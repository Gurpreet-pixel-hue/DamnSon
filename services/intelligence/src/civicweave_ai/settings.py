"""Application settings — reads from environment / .env file (PRD §13, Appendix B.5)."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    knowledge_database_url: str = Field(default="")

    # Auth
    internal_service_secret: str = Field(default="")

    # Gemini
    gemini_api_key: str = Field(default="")
    gemini_fast_model: str = Field(default="gemini-3.8-flash")
    gemini_embed_model: str = Field(default="gemini-embedding-2")
    embed_dim: int = Field(default=768)

    # Groq
    groq_api_key: str = Field(default="")
    groq_fast_model: str = Field(default="openai/gpt-oss-20b")

    # Model profile: strictly "production", "groq", or "local"
    cw_model_profile: str = Field(default="production")

    # Local LLM (Ollama-compatible; only used when CW_MODEL_PROFILE=local)
    local_llm_base_url: str = Field(default="http://localhost:11434/v1")
    local_fast_model: str = Field(default="")

    # Crawler
    crawler_user_agent: str = Field(default="CivicWeaveBot/1.0 (+https://civicweave.example)")

    def model_post_init(self, __context: Any) -> None:
        if self.cw_model_profile not in ("production", "groq", "local"):
            raise ValueError(f"Invalid CW_MODEL_PROFILE: {self.cw_model_profile}")

        if self.cw_model_profile == "production" and not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required when CW_MODEL_PROFILE is production")

        if self.cw_model_profile == "groq" and not self.groq_api_key:
            raise ValueError("GROQ_API_KEY is required when CW_MODEL_PROFILE is groq")


@lru_cache
def get_settings() -> Settings:
    return Settings()
