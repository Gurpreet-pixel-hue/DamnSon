import json
from typing import Type, cast

from groq import Groq
from groq.types.chat import ChatCompletionMessageParam
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
    client = Groq(api_key=settings.groq_api_key, timeout=timeout)

    schema_str = json.dumps(schema.model_json_schema())
    system_msg = {
        "role": "system",
        "content": f"Respond in JSON matching this schema: {schema_str}",
    }

    groq_messages: list[ChatCompletionMessageParam] = [cast(ChatCompletionMessageParam, system_msg)]
    for m in messages:
        role = "user" if m["role"] == "user" else "assistant"
        if m["role"] == "system":
            role = "system"
        groq_messages.append(
            cast(ChatCompletionMessageParam, {"role": role, "content": m["content"]})
        )

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=groq_messages,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        if not resp.choices or resp.choices[0].message.content is None:
            raise ProviderError("Groq returned no text")
        return resp.choices[0].message.content
    except Exception as e:
        raise ProviderError(f"Groq error: {e}") from e
