from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from civicweave_ai.guards.pii import redact
from civicweave_ai.guards.service_token import require_service_token
from civicweave_ai.llm.exceptions import NoProviderAvailable
from civicweave_ai.llm.router import generate_json
from civicweave_ai.retrieval.db import search_chunks

router = APIRouter()


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


@router.post("/v1/copilot", response_model=CopilotResponse)
async def copilot(req: CopilotRequest, _: str = Depends(require_service_token)) -> CopilotResponse:
    # 1. PII Redaction
    redacted_q = redact(req.question)

    # 2. Query Rewrite
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
        rewrite_res = generate_json("search", rewrite_messages, RewriteResponse)
        query_for_search = rewrite_res.rewritten_query
    except NoProviderAvailable:
        query_for_search = redacted_q

    # 3. Retrieval & Scope Retry
    state = req.jurisdiction.state if req.jurisdiction else None
    city = req.jurisdiction.city if req.jurisdiction else None
    scope = req.scopeUrls if req.scopeUrls else None

    chunks = search_chunks(query_for_search, state, city, scope, limit=20)

    if len(chunks) < 3 and scope is not None and len(scope) > 0:
        # Retry without scope
        chunks = search_chunks(query_for_search, state, city, None, limit=20)

    if not chunks:
        return CopilotResponse(language=req.locale, notice="not_found")

    # Deduplicate chunks just in case
    chunk_map = {str(c["id"]): c for c in chunks}

    # Context string
    context_text = "\n\n".join(f"--- Chunk ID: {c['id']} ---\nTitle: {c['title']}\nURL: {c['url']}\nText: {c['text']}" for c in chunk_map.values())

    # 4. LLM Generation & 2-Attempt Citation Repair
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

    attempts = 0
    max_attempts = 3  # Initial + 2 repairs

    while attempts < max_attempts:
        try:
            llm_res = generate_json("copilot", messages, CopilotLLMResponse)

            # Validation
            valid_citations = []
            errors = []

            for c in llm_res.citations:
                if c.chunkId not in chunk_map:
                    errors.append(f"Error: chunkId '{c.chunkId}' does not exist in context.")
                    continue

                chunk_data = chunk_map[c.chunkId]
                if c.quote not in chunk_data["text"]:
                    errors.append(f"Error: exact quote '{c.quote}' not found in chunk '{c.chunkId}'.")
                    continue

                valid_citations.append(c)

            if not errors:
                # Success! Hydrate and return
                final_citations = []
                for idx, c in enumerate(valid_citations[:8]):  # cap at 8
                    chunk_data = chunk_map[c.chunkId]
                    final_citations.append(
                        Citation(
                            n=idx + 1,
                            url=chunk_data["url"],
                            title=chunk_data["title"],
                            quote=c.quote,
                            chunkId=c.chunkId,
                            official=is_official_url(chunk_data["url"]),
                        )
                    )
                return CopilotResponse(answer=llm_res.answer, language=req.locale, citations=final_citations)

            # Repair needed
            attempts += 1
            if attempts < max_attempts:
                messages.append({"role": "assistant", "content": llm_res.model_dump_json()})
                messages.append(
                    {
                        "role": "user",
                        "content": "\n".join(errors) + "\nPlease correct your citations.",
                    }
                )

        except NoProviderAvailable:
            # Degraded fallback
            passages = []
            for ch in list(chunk_map.values())[:3]:
                passages.append(Passage(url=ch["url"], title=ch["title"], text=ch["text"][:1200]))
            return CopilotResponse(language=req.locale, notice="degraded", passages=passages)

    # If we exhausted 3 attempts and still failed validation
    return CopilotResponse(language=req.locale, notice="not_found")
