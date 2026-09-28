import asyncio
import time
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from civicweave_ai.main import app


def get_test_token() -> str:
    import hashlib
    import hmac

    from civicweave_ai.settings import get_settings

    now = int(time.time())
    secret = get_settings().internal_service_secret
    exp_str = str(now + 60)
    sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest()
    return f"Bearer {exp_str}.{sig}"


@pytest.mark.asyncio
async def test_health_not_stalled_by_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    import civicweave_ai.llm.router as router_mod

    def mock_generate(*args: Any, **kwargs: Any) -> Any:
        time.sleep(10)
        return None

    monkeypatch.setattr(router_mod, "generate_json", mock_generate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token = get_test_token()
        payload = {"query": "Test", "locale": "en", "candidates": []}

        start = time.time()

        # Fire search (which blocks its thread for 10s) and health concurrently
        search_task = asyncio.create_task(ac.post("/v1/search", json=payload, headers={"Authorization": token}))

        # Give search 0.1s to definitely enter the endpoint and hit the sleep block
        await asyncio.sleep(0.1)

        health_start = time.time()
        health_resp = await ac.get("/health")
        health_dur = time.time() - health_start

        assert health_resp.status_code == 200
        assert health_dur < 1.0  # Main event loop must not be blocked!

        # Now wait for search
        search_resp = await search_task
        search_dur = time.time() - start

        assert search_resp.status_code == 200
        assert search_dur < 5.0


@pytest.mark.asyncio
async def test_copilot_timeout_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import civicweave_ai.api.copilot as copilot_mod

    def mock_search(*args: Any, **kwargs: Any) -> list[Any]:
        return []

    def mock_generate(*args: Any, **kwargs: Any) -> Any:
        time.sleep(25)
        return None

    monkeypatch.setattr(copilot_mod, "search_chunks", mock_search)
    monkeypatch.setattr(copilot_mod, "generate_json", mock_generate)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        start = time.time()
        payload = {"question": "Test", "taskId": "test", "jurisdiction": None}
        resp = await ac.post("/v1/copilot", json=payload, headers={"Authorization": get_test_token()})
        dur = time.time() - start

        assert resp.status_code == 200
        assert dur < 23.0
        assert resp.json()["notice"] == "not_found"
