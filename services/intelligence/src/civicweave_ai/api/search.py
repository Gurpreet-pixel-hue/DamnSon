import asyncio
import json
import os
import re
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
    score: float = Field(ge=0.0, le=1.0)


class ClarificationOption(BaseModel):
    label: str
    value: str


class Clarification(BaseModel):
    kind: str
    text: str
    options: list[ClarificationOption] | None = Field(default=None, max_length=6)


class SearchResponse(BaseModel):
    facts: list[Fact]
    jurisdiction: Jurisdiction | None = None
    matches: list[Match] = Field(max_length=8)
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
_local_root = Path(__file__).parent.parent.parent.parent.parent.parent
_ROOT = Path(os.environ.get("CW_DATA_ROOT", str(_local_root)))

FACTS_PATH = _ROOT / "docs" / "contract" / "facts.json"
GAZETTEER_PATH = _ROOT / "data" / "gazetteer" / "maharashtra.json"


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

        aliases = place.get("aliases", [])
        norm_aliases = [_normalize_text(a) for a in aliases]

        for alias in aliases:
            norm = _normalize_text(alias)
            lookup[norm] = {"state": state, "city": city, "aliases": norm_aliases}
    return lookup, cities


def _find_alias_in_query(alias: str, raw_query: str) -> str | None:
    # Use word boundary to avoid prefix matching
    pattern = r"\b" + re.escape(alias) + r"\b"
    match = re.search(pattern, raw_query, re.IGNORECASE)
    if match:
        return match.group(0)
    return None


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

    with open(Path(__file__).parent.parent / "prompts" / "search_user.txt") as pf:
        user_prompt_template = pf.read()
    prompt = user_prompt_template.format(query=redacted_query, locale=req.locale, candidates_text=candidates_text)

    messages = [
        {"role": "system", "content": open(Path(__file__).parent.parent / "prompts" / "search_system.txt").read().strip()},
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
            # Require non-empty, verbatim evidence
            if not ef.evidence_substring.strip() or ef.evidence_substring not in redacted_query:
                continue

            if ef.key not in _FACTS_DEF:
                continue

            fdef = _FACTS_DEF[ef.key]
            ftype = fdef.get("type")
            valid = True

            if ftype == "boolean" and not isinstance(ef.value, bool):
                valid = False
            elif ftype == "string":
                if not isinstance(ef.value, str):
                    valid = False
                elif "enum" in fdef and ef.value not in fdef["enum"]:
                    valid = False
            elif ftype == "number":
                if not isinstance(ef.value, (int, float)) or isinstance(ef.value, bool):
                    valid = False
                else:
                    if "min" in fdef and ef.value < fdef["min"]:
                        valid = False
                    if "max" in fdef and ef.value > fdef["max"]:
                        valid = False

            if valid:
                facts.append(Fact(fact=ef.key, value=ef.value, evidence=ef.evidence_substring))

        # Jurisdiction
        for loc in extracted.locations:
            norm_loc = _normalize_text(loc)

            # 1. Take LLM proposed location as a hint to find a gazetteer entry
            candidate_match = None
            if norm_loc in _GAZETTEER_LOOKUP:
                candidate_match = _GAZETTEER_LOOKUP[norm_loc]
            else:
                # Handle over-specific extractions (e.g. "Andheri East, Mumbai" contains "mumbai")
                for g_alias, g_match in _GAZETTEER_LOOKUP.items():
                    if g_alias in norm_loc:
                        candidate_match = g_match
                        break

            if candidate_match:
                # 2. Check if ANY stored alias is a substring of the raw query (with word boundary)
                matched_exact = None
                for g_alias in candidate_match["aliases"]:
                    matched_exact = _find_alias_in_query(g_alias, redacted_query)
                    if matched_exact:
                        break

                if matched_exact:
                    jurisdiction = Jurisdiction(state=candidate_match["state"], city=candidate_match["city"], matchedText=matched_exact)
                    break

        if not extracted.is_civic_procedure:
            notice = "out_of_scope"
    else:
        # Fallback empty values
        extracted = Extraction(intent="", is_civic_procedure=True, facts=[], locations=[], candidate_scores=[])

    if jurisdiction is None:
        # Fallback: scan the raw query for gazetteer aliases if LLM didn't find any or failed
        for g_alias, g_match in _GAZETTEER_LOOKUP.items():
            matched_exact = _find_alias_in_query(g_alias, redacted_query)
            if matched_exact:
                jurisdiction = Jurisdiction(state=g_match["state"], city=g_match["city"], matchedText=matched_exact)
                break

    # If no jurisdiction matched and not provided in request
    if not jurisdiction and not req.location and notice != "out_of_scope":
        notice = "location_required"
        jurisdiction = None
        cities = _GAZETTEER_CITIES[:6] if _GAZETTEER_CITIES else ["Mumbai", "Pune", "Nagpur"]
        clarifications.append(
            Clarification(
                kind="location",
                text="Please specify your location in Maharashtra",
                options=[ClarificationOption(label=city, value=city) for city in cities],
            )
        )

    # Scores
    if extracted.candidate_scores:
        for c in req.candidates:
            raw_score = next((m.score for m in extracted.candidate_scores if m.taskId == c.taskId), 0.0)
            matches.append(Match(taskId=c.taskId, score=max(0.0, min(1.0, raw_score))))
    else:
        # Lexical fallback
        for c in req.candidates:
            doc = f"{c.title} {c.summary} {' '.join(c.keywords)}"
            raw_score = _jaccard(redacted_query, doc)
            matches.append(Match(taskId=c.taskId, score=max(0.0, min(1.0, raw_score))))

    matches.sort(key=lambda x: x.score, reverse=True)
    matches = matches[:8]

    if matches and matches[0].score < 0.3 and notice not in ["out_of_scope", "location_required"]:
        notice = "no_match"

    if len(matches) >= 2 and matches[0].score >= 0.3:
        if matches[0].score - matches[1].score <= 0.1:
            if len(clarifications) < 2:
                clarifications.append(
                    Clarification(
                        kind="task",
                        text="Which procedure do you mean?",
                        options=[ClarificationOption(label=matches[0].taskId, value=matches[0].taskId), ClarificationOption(label=matches[1].taskId, value=matches[1].taskId)],
                    )
                )

    return SearchResponse(
        facts=facts,
        jurisdiction=jurisdiction,
        matches=matches,
        clarifications=clarifications[:2],
        notice=notice,
    )
