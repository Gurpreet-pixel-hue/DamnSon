"""Application settings — reads from environment / .env file (PRD §13, Appendix B.5)."""

from __future__ import annotations

from functools import lru_cache

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

    # Model profile: "gemini" (default, production), "groq", or "local" (dev only)
    cw_model_profile: str = Field(default="gemini")

    # Local LLM (Ollama-compatible; only used when CW_MODEL_PROFILE=local)
    local_llm_base_url: str = Field(default="http://localhost:11434/v1")
    local_fast_model: str = Field(default="")

    # Crawler
    crawler_user_agent: str = Field(default="CivicWeaveBot/1.0 (+https://civicweave.example)")


@lru_cache
def get_settings() -> Settings:
    return Settings()
