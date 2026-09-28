import hashlib
import hmac
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from civicweave_ai.main import app
from civicweave_ai.settings import get_settings

client = TestClient(app)


def test_golden_search(monkeypatch: pytest.MonkeyPatch) -> None:
    # Mock LLM generation to make tests deterministic
    import civicweave_ai.api.search
    from civicweave_ai.api.search import ExtractedFact, Extraction

    def mock_generate_json(task: str, messages: list[dict[str, str]], schema: type) -> Extraction:
        query = messages[1]["content"]
        if "start a SaaS company in Mumbai" in query:
            return Extraction(
                intent="Start a business",
                is_civic_procedure=True,
                facts=[ExtractedFact(key="company.founders_count", value=2, evidence_substring="two founders"), ExtractedFact(key="employees.count", value=5, evidence_substring="five employees")],
                locations=["Mumbai"],
                candidate_scores=[],
            )
        if "फूड स्टॉल" in query:
            return Extraction(
                intent="Food stall",
                is_civic_procedure=True,
                facts=[ExtractedFact(key="business.sector", value="food_service", evidence_substring="फूड स्टॉल")],
                locations=["Pune"],
                candidate_scores=[],
            )
        if "ठाणे मध्ये एक दुकान" in query:
            return Extraction(intent="Shop", is_civic_procedure=True, facts=[], locations=["ठाणे"], candidate_scores=[])
        if "start up registration" in query:
            return Extraction(
                intent="Startup",
                is_civic_procedure=True,
                facts=[ExtractedFact(key="intent.dpiit", value=True, evidence_substring="start up registration")],
                locations=["Andheri"],
                candidate_scores=[],
            )
        if "How to pay my property tax?" in query:
            return Extraction(intent="Property tax", is_civic_procedure=True, facts=[], locations=[], candidate_scores=[])
        if "movie ticket" in query:
            return Extraction(intent="Movie", is_civic_procedure=False, facts=[], locations=[], candidate_scores=[])
        if "apply for GST" in query:
            return Extraction(
                intent="GST",
                is_civic_procedure=True,
                facts=[
                    ExtractedFact(key="intent.gst_now", value=True, evidence_substring="apply for GST"),
                    ExtractedFact(key="business.sector", value="retail", evidence_substring="retail"),
                ],
                locations=[],
                candidate_scores=[],
            )
        if "ट्रेडमार्क" in query:
            return Extraction(intent="Trademark", is_civic_procedure=True, facts=[ExtractedFact(key="intent.trademark", value=True, evidence_substring="ट्रेडमार्क")], locations=[], candidate_scores=[])
        if "pan card kadhaycha" in query:
            return Extraction(intent="PAN card", is_civic_procedure=True, facts=[ExtractedFact(key="applicant.type", value="company", evidence_substring="company")], locations=[], candidate_scores=[])
        if "What is the capital of France?" in query:
            return Extraction(intent="Capital of France", is_civic_procedure=False, facts=[], locations=[], candidate_scores=[])

        return Extraction(intent="", is_civic_procedure=True, facts=[], locations=[], candidate_scores=[])

    monkeypatch.setattr(civicweave_ai.api.search, "generate_json", mock_generate_json)

    settings = get_settings()
    now = int(time.time())
    secret = settings.internal_service_secret
    exp_str = str(now + 60)
    sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest().lower()
    token = f"Bearer {exp_str}.{sig}"

    golden_path = Path(__file__).parent / "golden_search.jsonl"

    with open(golden_path) as f:
        for line_idx, line in enumerate(f):
            if not line.strip():
                continue
            case = json.loads(line)
            req_data = {"query": case["query"], "locale": case["locale"], "candidates": case.get("candidates", [])}
            if case.get("location"):
                req_data["location"] = case["location"]

            resp = client.post("/v1/search", json=req_data, headers={"Authorization": token})
            assert resp.status_code == 200, f"Line {line_idx + 1} failed: {resp.text}"
            data = resp.json()

            if case.get("expected_taskId"):
                assert len(data["matches"]) > 0, f"Line {line_idx + 1} expected match but got none"
                assert data["matches"][0]["taskId"] == case["expected_taskId"], f"Line {line_idx + 1} expected {case['expected_taskId']} got {data['matches'][0]['taskId']}"

            if case.get("notice"):
                assert data.get("notice") == case["notice"], f"Line {line_idx + 1} expected notice {case['notice']} got {data.get('notice')}"

            if "expected_facts" in case:
                extracted_keys = [f["fact"] for f in data.get("facts", [])]
                for ef in case["expected_facts"]:
                    if ef not in extracted_keys:
                        print(f"FAILED on line {line_idx + 1}: missing {ef}")
                        print(f"Response: {data}")
                    assert ef in extracted_keys, f"Line {line_idx + 1} expected fact {ef} missing"


def test_search_timeout_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio
    import hashlib
    import hmac
    import time

    from civicweave_ai.settings import get_settings

    async def slow_to_thread(func: object, *args: object, **kwargs: object) -> None:
        await asyncio.sleep(5.0)
        return None

    monkeypatch.setattr(asyncio, "to_thread", slow_to_thread)

    settings = get_settings()
    now = int(time.time())
    secret = settings.internal_service_secret
    exp_str = str(now + 60)
    sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest().lower()
    token = f"Bearer {exp_str}.{sig}"

    start = time.time()
    resp = client.post("/v1/search", json={"query": "test query", "locale": "en"}, headers={"Authorization": token})
    duration = time.time() - start

    assert resp.status_code == 200
    assert duration < 5.0, f"Search took {duration}s, should be < 5.0s"
    data = resp.json()
    assert "matches" in data

def test_search_hallucinated_location(monkeypatch: pytest.MonkeyPatch) -> None:
    import hashlib
    import hmac
    import time

    import civicweave_ai.api.search
    from civicweave_ai.api.search import Extraction
    from civicweave_ai.settings import get_settings

    def mock_generate_json(task: str, messages: list[dict[str, str]], schema: type) -> Extraction:
        return Extraction(intent="Test", is_civic_procedure=True, facts=[], locations=["Nagpur"], candidate_scores=[])

    monkeypatch.setattr(civicweave_ai.api.search, "generate_json", mock_generate_json)
    settings = get_settings()
    now = int(time.time())
    secret = settings.internal_service_secret
    exp_str = str(now + 60)
    sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest().lower()
    token = f"Bearer {exp_str}.{sig}"
    resp = client.post("/v1/search", json={"query": "Test query with no location", "locale": "en"}, headers={"Authorization": token})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("jurisdiction") is None
