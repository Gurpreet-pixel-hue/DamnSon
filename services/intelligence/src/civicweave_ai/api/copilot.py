import asyncio
import time
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from civicweave_ai.guards.pii import redact
from civicweave_ai.guards.service_token import require_service_token
from civicweave_ai.llm.exceptions import NoProviderAvailable
from civicweave_ai.llm.router import generate_json
from civicweave_ai.retrieval.db import search_chunks

router = APIRouter()

# PRD §1.3 hard deadlines (seconds)
_RETRIEVAL_DEADLINE = 3.0
_ANSWER_TIMEOUT = 12.0
_REPAIR_TIMEOUT = 8.0
_OVERALL_DEADLINE = 22.0


class Jurisdiction(BaseModel):
    state: str
    city: str | None = None
    matchedText: str | None = None


class CopilotRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    taskId: str | None = None
    stepId: str | None = None
    locale: str = "en"
    jurisdiction: Jurisdiction | None = None
    scopeUrls: list[str] | None = None
    stepTitle: str | None = None


class Citation(BaseModel):
    n: int
    url: str
    title: str
    quote: str
    chunkId: str
    official: bool


class Passage(BaseModel):
    url: str
    title: str
    text: str


class CopilotResponse(BaseModel):
    requestId: str | None = None
    answer: str | None = None
    language: str
    citations: list[Citation] = []
    notice: Literal["not_found", "out_of_scope", "degraded"] | None = None
    passages: list[Passage] | None = None


class RewriteResponse(BaseModel):
    rewritten_query: str


class LLMCitation(BaseModel):
    chunkId: str
    quote: str


class CopilotLLMResponse(BaseModel):
    answer: str
    citations: list[LLMCitation]


def is_official_url(url: str) -> bool:
    # simple check matching PRD definition (.gov.in/.nic.in)
    return ".gov.in" in url or ".nic.in" in url


def _safe_passages(chunk_map: dict[str, dict[str, object]], locale: str) -> CopilotResponse:
    """Return top-3 passage fallback (not_found with passages)."""
    passages = [
        Passage(
            url=str(ch["source_url"]),
            title=str(ch["source_title"]),
            text=str(ch["chunk_text"])[:1200],
        )
        for ch in list(chunk_map.values())[:3]
    ]
    return CopilotResponse(language=locale, notice="not_found", passages=passages)


@router.post("/v1/copilot", response_model=CopilotResponse)
async def copilot(req: CopilotRequest, _: str = Depends(require_service_token)) -> CopilotResponse:
    request_start = time.monotonic()

    def elapsed() -> float:
        return time.monotonic() - request_start

    def budget_remaining() -> float:
        return _OVERALL_DEADLINE - elapsed()

    # 1. PII Redaction
    redacted_q = redact(req.question)

    # 2. Query Rewrite (uses the search task timeout from policy.yaml)
    try:
        rewrite_messages = [
            {
                "role": "system",
                "content": (
                    "You expand abbreviations (e.g. PT to Property Tax, DSC to "
                    "Digital Signature Certificate, CIN to Corporate Identity "
                    "Number) and transliterate romanised Hindi/Marathi to proper "
                    "English script for optimal semantic search. Do not answer "
                    "the question, just return the rewritten query."
                ),
            },
            {"role": "user", "content": redacted_q},
        ]
        rewrite_res = await asyncio.wait_for(
            asyncio.to_thread(generate_json, "search", rewrite_messages, RewriteResponse),
            timeout=min(4.0, budget_remaining()),
        )
        query_for_search = rewrite_res.rewritten_query
    except (asyncio.TimeoutError, NoProviderAvailable):
        query_for_search = redacted_q

    # 3. Retrieval & Scope Retry — must finish within 3s
    state = req.jurisdiction.state if req.jurisdiction else None
    city = req.jurisdiction.city if req.jurisdiction else None
    scope = req.scopeUrls if req.scopeUrls else None

    try:
        ret_timeout = min(_RETRIEVAL_DEADLINE, budget_remaining())
        chunks = await asyncio.wait_for(
            asyncio.to_thread(search_chunks, query_for_search, state, city, scope, 20),
            timeout=max(0.1, ret_timeout),
        )
        if len(chunks) < 3 and scope is not None and len(scope) > 0:
            retry_timeout = min(_RETRIEVAL_DEADLINE, budget_remaining())
            chunks = await asyncio.wait_for(
                asyncio.to_thread(search_chunks, query_for_search, state, city, None, 20),
                timeout=max(0.1, retry_timeout),
            )
    except asyncio.TimeoutError:
        print(f"Retrieval timed out after {elapsed():.1f}s")
        return CopilotResponse(language=req.locale, notice="not_found")

    if not chunks:
        return CopilotResponse(language=req.locale, notice="not_found")

    # Deduplicate chunks just in case
    chunk_map = {str(c["chunk_id"]): c for c in chunks}

    # Context string
    context_text = "\n\n".join(f"--- Chunk ID: {c['chunk_id']} ---\nTitle: {c['source_title']}\nURL: {c['source_url']}\nText: {c['chunk_text']}" for c in chunk_map.values())

    # 4. LLM Generation — 1 initial attempt (12s) + at most 1 repair (8s)
    system_prompt = (
        "You are a helpful civic assistant. Answer the user's question using ONLY the "
        "provided text chunks. If the answer is not in the text, say 'I cannot find the "
        "answer in the official documents.' You must cite your sources. For every claim, "
        "provide an exact substring quote from the text and the chunkId it came from."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": f"Context documents:\n{context_text}\n\nQuestion: {redacted_q}",
        },
    ]

    # PRD §1.3: max_attempts=2 (1 initial + 1 repair)
    for attempt in range(2):
        # Wall-clock check before each LLM call
        if budget_remaining() < 1.0:
            print(f"Deadline budget exhausted at attempt {attempt} after {elapsed():.1f}s")
            return _safe_passages(chunk_map, req.locale)

        call_timeout = _ANSWER_TIMEOUT if attempt == 0 else _REPAIR_TIMEOUT
        # Never exceed overall deadline
        call_timeout = min(call_timeout, budget_remaining() - 0.5)

        try:
            llm_res = await asyncio.wait_for(
                asyncio.to_thread(generate_json, "answer" if attempt == 0 else "repair", messages, CopilotLLMResponse),
                timeout=call_timeout,
            )
        except asyncio.TimeoutError:
            print(f"LLM call timed out at attempt {attempt} after {elapsed():.1f}s")
            return _safe_passages(chunk_map, req.locale)
        except NoProviderAvailable:
            # Degraded fallback — return raw passages
            passages = [Passage(url=str(ch["source_url"]), title=str(ch["source_title"]), text=str(ch["chunk_text"])[:1200]) for ch in list(chunk_map.values())[:3]]
            return CopilotResponse(language=req.locale, notice="degraded", passages=passages)

        # Citation validation
        valid_citations = []
        errors = []

        if len(llm_res.answer) > 4000:
            llm_res.answer = llm_res.answer[:4000]

        import re

        answer_numbers = set(re.findall(r"\d+", llm_res.answer))

        for c in llm_res.citations:
            if not c.quote.strip():
                errors.append(f"Error: quote is empty for chunk '{c.chunkId}'.")
                continue
            if len(c.quote) > 500:
                errors.append(f"Error: quote exceeds 500 characters for chunk '{c.chunkId}'.")
                continue
            if c.chunkId not in chunk_map:
                errors.append(f"Error: chunkId '{c.chunkId}' does not exist in context.")
                continue
            chunk_data = chunk_map[c.chunkId]
            if c.quote not in str(chunk_data["chunk_text"]):
                errors.append(f"Error: exact quote '{c.quote}' not found in chunk '{c.chunkId}'.")
                continue
            valid_citations.append(c)

        # Only check number support if there are no other errors yet
        if not errors:
            cited_numbers = set()
            for c in valid_citations:
                cited_numbers.update(re.findall(r"\d+", c.quote))
            unsupported = answer_numbers - cited_numbers
            if unsupported:
                errors.append(f"Error: numbers {unsupported} appear in answer but are not supported by any cited quote.")

        if not errors:
            if not valid_citations:
                # If zero valid citations produced, and no errors (meaning they provided 0 citations),
                # trigger an error to force repair, or fail if out of attempts.
                errors.append("Error: you must provide at least one citation.")
            else:
                # Success — hydrate and return
                final_citations = [
                    Citation(
                        n=idx + 1,
                        url=str(chunk_map[c.chunkId]["source_url"]),
                        title=str(chunk_map[c.chunkId]["source_title"]),
                        quote=c.quote,
                        chunkId=c.chunkId,
                        official=bool(chunk_map[c.chunkId].get("is_official", False)),
                    )
                    for idx, c in enumerate(valid_citations[:8])
                ]
                return CopilotResponse(answer=llm_res.answer, language=req.locale, citations=final_citations)

        # Repair: append errors and loop (only once — attempt 1 exits the loop)
        messages.append({"role": "assistant", "content": llm_res.model_dump_json()})
        messages.append(
            {
                "role": "user",
                "content": "\n".join(errors) + "\nPlease correct your citations.",
            }
        )

    # Exhausted both attempts and still invalid citations (or zero valid citations)
    return _safe_passages(chunk_map, req.locale)
