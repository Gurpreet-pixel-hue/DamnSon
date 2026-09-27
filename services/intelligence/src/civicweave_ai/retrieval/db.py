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
    vectors = embed_texts([query_text])
    if not vectors:
        return []
    vector = vectors[0]

    # Convert python list to postgres array syntax for vector
    vector_str = f"[{','.join(str(x) for x in vector)}]"

    # 2. Call Postgres function
    results = []
    try:
        with psycopg.connect(
            settings.knowledge_database_url, autocommit=True, row_factory=dict_row
        ) as conn:
            with conn.cursor() as cur:
                # The search_chunks function takes:
                # query_embedding vector(768), match_count int, filter_state text, filter_city text,
                # filter_urls text[]
                cur.execute(
                    "SELECT * FROM search_chunks(%s, %s, %s, %s, %s)",
                    (vector_str, limit, state, city, scope_urls),
                )
                rows = cur.fetchall()
                for row in rows:
                    results.append(row)
    except Exception:
        # If DB fails or is uninitialized, we just return empty
        # We don't crash, we just fallback to not_found/degraded later
        pass

    return results
