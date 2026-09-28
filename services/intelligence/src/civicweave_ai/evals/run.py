import hashlib
import hmac
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import BaseModel

from civicweave_ai.llm.router import generate_json
from civicweave_ai.main import app
from civicweave_ai.settings import get_settings


def generate_token() -> str:
    settings = get_settings()
    now = int(time.time())
    secret = settings.internal_service_secret
    exp_str = str(now + 60)
    sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest()
    return f"Bearer {exp_str}.{sig}"


client = TestClient(app)
TOKEN = generate_token()


class GroundedEval(BaseModel):
    is_grounded: bool


def is_sentence_grounded(sentence: str, quotes: list[str]) -> bool:
    if not quotes:
        return False
    messages = [
        {"role": "system", "content": "Evaluate if the sentence is fully supported by the provided quotes."},
        {"role": "user", "content": f"Sentence: {sentence}\n\nQuotes:\n" + "\n".join(quotes)},
    ]
    try:
        res = generate_json("eval", messages, GroundedEval)
        return res.is_grounded
    except Exception:
        return False


def run_evals() -> None:
    root = Path(__file__).parent.parent.parent.parent.parent.parent
    intent_path = root / "data" / "eval" / "intent.jsonl"
    jurisdiction_path = root / "data" / "eval" / "jurisdiction.jsonl"
    copilot_path = root / "data" / "eval" / "copilot.jsonl"
    report_dir = root / "services" / "intelligence" / "evals" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)

    mock_candidates = []
    template_dir = root / "data" / "seed" / "templates"
    for path in template_dir.glob("*.json"):
        with open(path, "r") as tf:
            t = json.load(tf)
            mock_candidates.append({"taskId": t.get("taskId", t.get("id")), "title": t["title"], "summary": t["summary"], "keywords": t.get("keywords", [])})

    intent_total = 0
    intent_top1_hits = 0
    facts_total = 0
    facts_hits = 0
    jurisdiction_total = 0
    jurisdiction_hits = 0
    copilot_answerable = 0
    copilot_grounded_sentences = 0
    copilot_total_sentences = 0
    copilot_unanswerable = 0
    copilot_unanswerable_not_found = 0

    print("Running Intent Eval...")
    with open(intent_path, "r") as f:
        for line in f:
            if not line.strip():
                continue
            case = json.loads(line)
            resp = client.post(
                "/v1/search",
                json={"query": case["query"], "locale": case["locale"], "candidates": mock_candidates},
                headers={"Authorization": generate_token()},
            )
            if resp.status_code == 200:
                data = resp.json()
                matches = data.get("matches", [])
                intent_total += 1
                if matches and matches[0]["taskId"] == case.get("expectedTaskId"):
                    intent_top1_hits += 1

                expected_facts = case.get("expectedFacts", {})
                extracted_facts = {f["fact"]: f["value"] for f in data.get("facts", [])}
                for k, v in expected_facts.items():
                    facts_total += 1
                    if k in extracted_facts and extracted_facts[k] == v:
                        facts_hits += 1
            else:
                print(f"Error {resp.status_code}: {resp.text}")

    print("Running Jurisdiction Eval...")
    with open(jurisdiction_path, "r") as f:
        for line in f:
            if not line.strip():
                continue
            case = json.loads(line)
            resp = client.post("/v1/search", json={"query": case["text"], "locale": "en", "candidates": mock_candidates}, headers={"Authorization": generate_token()})
            if resp.status_code == 200:
                data = resp.json()
                jurisdiction_total += 1
                jurisdiction = data.get("jurisdiction")
                if jurisdiction:
                    if jurisdiction["state"] == case["expected"]["state"] and (not case["expected"].get("city") or jurisdiction.get("city") == case["expected"]["city"]):
                        jurisdiction_hits += 1
            else:
                print(f"Error {resp.status_code}: {resp.text}")

    print("Running Copilot Eval...")
    with open(copilot_path, "r") as f:
        for line in f:
            if not line.strip():
                continue
            case = json.loads(line)
            req_body = {"question": case["question"], "taskId": case["taskId"], "jurisdiction": {"level": "city", "state": "Maharashtra", "city": "Mumbai"}}
            resp = client.post("/v1/copilot", json=req_body, headers={"Authorization": generate_token()})
            if resp.status_code == 200:
                data = resp.json()
                if case["answerable"]:
                    copilot_answerable += 1
                    ans = data.get("answer")
                    if ans:
                        sentences = [s for s in ans.split(".") if s.strip()]
                        copilot_total_sentences += len(sentences)
                        citations = data.get("citations", [])
                        quotes = [c["quote"] for c in citations if "quote" in c]
                        for s in sentences:
                            if is_sentence_grounded(s, quotes):
                                copilot_grounded_sentences += 1
                else:
                    copilot_unanswerable += 1
                    if data.get("notice") in ["not_found", "out_of_scope"] or not data.get("answer"):
                        copilot_unanswerable_not_found += 1
            else:
                print(f"Error {resp.status_code}: {resp.text}")

    table = f"""
| Metric | Score | Hits / Total |
|---|---|---|
| Journey match top-1 | {intent_top1_hits / intent_total * 100 if intent_total else 0:.1f}% | {intent_top1_hits} / {intent_total} |
| Fact exact match | {facts_hits / facts_total * 100 if facts_total else 0:.1f}% | {facts_hits} / {facts_total} |
| Jurisdiction accuracy | {jurisdiction_hits / jurisdiction_total * 100 if jurisdiction_total else 0:.1f}% | {jurisdiction_hits} / {jurisdiction_total} |
| Copilot Groundedness | {copilot_grounded_sentences / copilot_total_sentences * 100 if copilot_total_sentences else 0:.1f}% | {copilot_grounded_sentences} / {copilot_total_sentences} |
| Unanswerable 'not found' | {copilot_unanswerable_not_found / copilot_unanswerable * 100 if copilot_unanswerable else 0:.1f}% | {copilot_unanswerable_not_found} / {copilot_unanswerable} |
"""
    print(table)

    report_file = report_dir / f"eval_report_{int(time.time())}.json"
    with open(report_file, "w") as f:
        json.dump(
            {
                "intent_top1_hits": intent_top1_hits,
                "intent_total": intent_total,
                "facts_hits": facts_hits,
                "facts_total": facts_total,
                "jurisdiction_hits": jurisdiction_hits,
                "jurisdiction_total": jurisdiction_total,
                "copilot_grounded_sentences": copilot_grounded_sentences,
                "copilot_total_sentences": copilot_total_sentences,
                "copilot_unanswerable_not_found": copilot_unanswerable_not_found,
                "copilot_unanswerable": copilot_unanswerable,
            },
            f,
            indent=2,
        )

    print(f"Report saved to {report_file}")


if __name__ == "__main__":
    run_evals()
