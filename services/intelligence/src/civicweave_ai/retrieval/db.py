from typing import Any

import psycopg
from psycopg.rows import dict_row

from civicweave_ai.embeddings.router import embed_texts
from civicweave_ai.settings import get_settings


def search_chunks(
    query_text: str,
    state: str | None,
    city: str | None,
    scope_urls: list[str] | None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    settings = get_settings()
    if not query_text.strip():
        return []

    # 1. Embed query
    vector_str = None
    try:
        vectors = embed_texts([query_text], task_type="RETRIEVAL_QUERY")
        if vectors and vectors[0]:
            vector = vectors[0]
            vector_str = f"[{','.join(str(x) for x in vector)}]"
    except Exception as e:
        print(f"Embedding generation failed: {e}")
        # Continue with vector_str = None (lexical fallback)

    # 2. Call Postgres function
    results = []
    try:
        with psycopg.connect(settings.knowledge_database_url, autocommit=True, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                # The search_chunks function takes:
                # q_text text, q_embedding vector(768), p_state text, p_city text, p_scope_urls text[], p_limit int
                cur.execute(
                    "SELECT * FROM knowledge.search_chunks(%s, %s, %s, %s, %s, %s)",
                    (query_text, vector_str, state, city, scope_urls, limit),
                )
                rows = cur.fetchall()
                for row in rows:
                    results.append(row)
    except Exception as e:
        print(f"Database error during search: {e}")
        # If DB fails or is uninitialized, we just return empty
        # We don't crash, we just fallback to not_found/degraded later
        pass

    return results
