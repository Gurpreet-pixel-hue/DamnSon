import os
from typing import Any

import pytest

import civicweave_ai.settings


@pytest.fixture(autouse=True)
def mock_env_vars() -> Any:
    os.environ["INTERNAL_SERVICE_SECRET"] = "test-secret"
    os.environ["GEMINI_FAST_MODEL"] = "gemini-3.8-flash"
    os.environ["GROQ_FAST_MODEL"] = "groq-fast"
    os.environ["CW_MODEL_PROFILE"] = "production"
    civicweave_ai.settings.get_settings.cache_clear()
    yield
    os.environ.pop("INTERNAL_SERVICE_SECRET", None)
    os.environ.pop("GEMINI_FAST_MODEL", None)
    os.environ.pop("GROQ_FAST_MODEL", None)
    os.environ.pop("CW_MODEL_PROFILE", None)
    civicweave_ai.settings.get_settings.cache_clear()
