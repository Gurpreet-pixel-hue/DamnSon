from typing import Type

from google import genai
from google.genai.types import GenerateContentConfig, HttpOptions
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
    client = genai.Client(api_key=settings.gemini_api_key, http_options=HttpOptions(timeout=30000))

    system_instruction = None
    contents = []
    for msg in messages:
        if msg["role"] == "system":
            system_instruction = msg["content"]
        else:
            # We map 'user' and 'assistant' roles if needed,
            # but simplest is passing them as contents if they are strings.
            # Usually we construct Content objects or just strings.
            contents.append(msg["content"])

    try:
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=GenerateContentConfig(
                system_instruction=system_instruction,
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
