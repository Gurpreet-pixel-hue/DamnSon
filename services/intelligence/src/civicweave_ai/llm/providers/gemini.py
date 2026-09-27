from typing import Type

from google import genai
from google.genai.types import GenerateContentConfig
from pydantic import BaseModel

from civicweave_ai.llm.exceptions import ProviderError
from civicweave_ai.settings import get_settings


def call(
    messages: list[dict[str, str]],
    schema: Type[BaseModel],
    model: str,
    temperature: float,
    timeout: int,
) -> str:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    contents = [msg["content"] for msg in messages]

    try:
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema.model_json_schema(),
                temperature=temperature,
            ),
        )
        if resp.text is None:
            raise ProviderError("Gemini returned no text")
        return resp.text
    except Exception as e:
        raise ProviderError(f"Gemini error: {e}") from e
