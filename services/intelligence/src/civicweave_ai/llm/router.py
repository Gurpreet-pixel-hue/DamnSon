import threading
import time
from pathlib import Path
from typing import Any, Type, TypeVar, cast

import yaml
from pydantic import BaseModel

from civicweave_ai.llm.exceptions import NoProviderAvailable
from civicweave_ai.llm.providers import gemini, groq, local
from civicweave_ai.settings import get_settings

T = TypeVar("T", bound=BaseModel)


class CircuitBreaker:
    def __init__(self, max_failures: int = 5, window_s: int = 60, open_s: int = 30) -> None:
        self.max_failures = max_failures
        self.window_s = window_s
        self.open_s = open_s
        self.failures: list[float] = []
        self.opened_at: float = 0.0
        self.lock = threading.Lock()

    def record_failure(self) -> None:
        now = time.time()
        with self.lock:
            self.failures = [f for f in self.failures if now - f < self.window_s]
            self.failures.append(now)
            if len(self.failures) >= self.max_failures:
                self.opened_at = now

    def record_success(self) -> None:
        with self.lock:
            self.failures.clear()
            self.opened_at = 0.0

    def is_closed(self) -> bool:
        now = time.time()
        with self.lock:
            if self.opened_at == 0.0:
                return True
            if now - self.opened_at > self.open_s:
                return True
            return False


_breakers = {
    "gemini": CircuitBreaker(),
    "groq": CircuitBreaker(),
    "local": CircuitBreaker(),
}

POLICY_PATH = Path(__file__).parent / "policy.yaml"


def _load_policy() -> dict[str, Any]:
    with open(POLICY_PATH, "r") as f:
        return cast(dict[str, Any], yaml.safe_load(f))


def get_available_provider() -> str:
    settings = get_settings()
    policy = _load_policy()
    profile = settings.cw_model_profile
    order = cast(list[str], policy.get("profiles", {}).get(profile, ["gemini", "groq"]))

    for provider_name in order:
        if _breakers.get(provider_name, CircuitBreaker()).is_closed():
            return provider_name
    return "rules"


def generate_json(task: str, messages: list[dict[str, str]], schema: Type[T]) -> T:
    settings = get_settings()
    policy = _load_policy()

    profile = settings.cw_model_profile
    order = cast(list[str], policy.get("profiles", {}).get(profile, ["gemini", "groq"]))
    timeout = int(policy.get("timeouts", {}).get(task, 15))
    temperature = float(policy.get("temperatures", {}).get(task, 0.0))

    for provider_name in order:
        breaker = _breakers.get(provider_name)
        if breaker is None or not breaker.is_closed():
            continue

        try:
            result_text = ""
            if provider_name == "gemini":
                result_text = gemini.call(messages, schema, settings.gemini_fast_model, temperature, timeout)
            elif provider_name == "groq":
                result_text = groq.call(messages, schema, settings.groq_fast_model, temperature, timeout)
            elif provider_name == "local":
                result_text = local.call(messages, schema, settings.local_fast_model, temperature, timeout)

            if result_text:
                breaker.record_success()
                return schema.model_validate_json(result_text)
        except Exception as e:
            print(f"Provider {provider_name} failed with: {e}")
            breaker.record_failure()

    raise NoProviderAvailable("All providers failed or are open")
