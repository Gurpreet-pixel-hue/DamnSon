import asyncio
import json
import string
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from civicweave_ai.guards.pii import redact
from civicweave_ai.guards.service_token import require_service_token
from civicweave_ai.llm.exceptions import NoProviderAvailable
from civicweave_ai.llm.router import generate_json

router = APIRouter()


# --- Request / Response Models ---
class TemplateSummary(BaseModel):
    taskId: str
    title: str
    summary: str
    keywords: list[str] = []


class SearchRequest(BaseModel):
    query: str
    location: dict[str, Any] | None = None
    category: str | None = None
    locale: str
    candidates: list[TemplateSummary] = []


class Fact(BaseModel):
    fact: str
    value: Any
    evidence: str


class Jurisdiction(BaseModel):
    state: str
    city: str | None = None
    matchedText: str


class Match(BaseModel):
    taskId: str
    score: float


class Clarification(BaseModel):
    kind: str
    text: str
    options: list[str] | None = None


class SearchResponse(BaseModel):
    facts: list[Fact]
    jurisdiction: Jurisdiction | None = None
    matches: list[Match]
    clarifications: list[Clarification] = []
    notice: str | None = None


# --- LLM Extraction Model ---
class ExtractedFact(BaseModel):
    key: str
    value: Any
    evidence_substring: str


class Extraction(BaseModel):
    intent: str
    is_civic_procedure: bool
    facts: list[ExtractedFact]
    locations: list[str]
    candidate_scores: list[Match] = Field(description="Score from 0.0 to 1.0 for each candidate taskId")


# --- Globals ---
FACTS_PATH = Path(__file__).parent.parent.parent.parent.parent.parent / "docs" / "contract" / "facts.json"
GAZETTEER_PATH = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "gazetteer" / "maharashtra.json"


def _load_json(path: Path) -> Any:
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return {}


def _normalize_text(text: str) -> str:
    # Lowercase and strip punctuation
    t = text.lower()
    return t.translate(str.maketrans("", "", string.punctuation)).strip()


def _build_gazetteer() -> tuple[dict[str, dict[str, Any]], list[str]]:
    data = _load_json(GAZETTEER_PATH)
    lookup = {}
    cities = []
    for place in data.get("places", []):
        state = place.get("state")
        city = place.get("city")
        if city and city not in cities:
            cities.append(city)
        for alias in place.get("aliases", []):
            norm = _normalize_text(alias)
            lookup[norm] = {"state": state, "city": city, "raw": alias}
    return lookup, cities


_GAZETTEER_LOOKUP, _GAZETTEER_CITIES = _build_gazetteer()
_FACTS_DEF = _load_json(FACTS_PATH)


def _jaccard(q: str, doc: str) -> float:
    qt = set(_normalize_text(q).split())
    dt = set(_normalize_text(doc).split())
    if not qt or not dt:
        return 0.0
    return len(qt.intersection(dt)) / len(qt.union(dt))


@router.post("/v1/search", dependencies=[Depends(require_service_token)])
async def search(req: SearchRequest) -> SearchResponse:
    redacted_query = redact(req.query)

    # 1. Prepare candidates text
    candidates_text = ""
    for c in req.candidates:
        candidates_text += f"- taskId: {c.taskId}\n  title: {c.title}\n  summary: {c.summary}\n  keywords: {', '.join(c.keywords)}\n\n"

    prompt = f"""
Query: "{redacted_query}"
Locale: {req.locale}

Candidates:
{candidates_text}

Extract intent, check if civic, extract facts (use exact substring for evidence), mention locations, and score candidates 0.0 to 1.0.
"""

    messages = [
        {"role": "system", "content": "You are a civic procedure extraction assistant."},
        {"role": "user", "content": prompt},
    ]

    extracted = None
    try:
        extracted = await asyncio.wait_for(asyncio.to_thread(generate_json, "extract", messages, Extraction), timeout=4.5)
    except asyncio.TimeoutError:
        print("Extraction LLM call timed out")
    except NoProviderAvailable as e:
        print(f"Provider error: {e}")

    facts = []
    jurisdiction = None
    matches = []
    clarifications = []
    notice = None

    print(f"Extracted: {extracted}")
    if extracted:
        # Validate facts
        for ef in extracted.facts:
            if ef.key in _FACTS_DEF and ef.evidence_substring in redacted_query:
                # Basic validation passed
                facts.append(Fact(fact=ef.key, value=ef.value, evidence=ef.evidence_substring))

        # Jurisdiction
        for loc in extracted.locations:
            norm = _normalize_text(loc)
            if norm in _GAZETTEER_LOOKUP and norm in _normalize_text(redacted_query):
                match = _GAZETTEER_LOOKUP[norm]
                jurisdiction = Jurisdiction(state=match["state"], city=match["city"], matchedText=loc)
                break

        if not extracted.is_civic_procedure:
            notice = "out_of_scope"
    else:
        # Fallback empty values
        extracted = Extraction(intent="", is_civic_procedure=True, facts=[], locations=[], candidate_scores=[])

    # If no jurisdiction matched and not provided in request
    if not jurisdiction and not req.location and notice != "out_of_scope":
        notice = "location_required"
        jurisdiction = None
        clarifications.append(
            Clarification(
                kind="location",
                text="Please specify your location in Maharashtra",
                options=_GAZETTEER_CITIES[:5] if _GAZETTEER_CITIES else ["Mumbai", "Pune", "Nagpur"],
            )
        )

    # Scores
    if extracted.candidate_scores:
        for c in req.candidates:
            matches.append(Match(taskId=c.taskId, score=next((m.score for m in extracted.candidate_scores if m.taskId == c.taskId), 0.0)))
    else:
        # Lexical fallback
        for c in req.candidates:
            doc = f"{c.title} {c.summary} {' '.join(c.keywords)}"
            score = _jaccard(redacted_query, doc)
            matches.append(Match(taskId=c.taskId, score=score))

    matches.sort(key=lambda x: x.score, reverse=True)

    if matches and matches[0].score < 0.3 and notice not in ["out_of_scope", "location_required"]:
        notice = "no_match"

    if len(matches) >= 2 and matches[0].score >= 0.3:
        if matches[0].score - matches[1].score <= 0.1:
            if len(clarifications) < 2:
                clarifications.append(
                    Clarification(
                        kind="task",
                        text="Which procedure do you mean?",
                        options=[matches[0].taskId, matches[1].taskId],
                    )
                )

    return SearchResponse(
        facts=facts,
        jurisdiction=jurisdiction,
        matches=matches,
        clarifications=clarifications[:2],
        notice=notice,
    )
