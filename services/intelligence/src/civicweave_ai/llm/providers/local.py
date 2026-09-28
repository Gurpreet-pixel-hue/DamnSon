from typing import Type

from pydantic import BaseModel

from civicweave_ai.llm.exceptions import ProviderError


def call(
    messages: list[dict[str, str]],
    schema: Type[BaseModel],
    model: str,
    temperature: float,
    timeout: int,
) -> str:
    raise ProviderError("Local provider not implemented")
