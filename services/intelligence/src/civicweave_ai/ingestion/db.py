from urllib.parse import urlparse

import psycopg
from pgvector.psycopg import register_vector_async

from civicweave_ai.ingestion.chunk import Chunk
from civicweave_ai.settings import get_settings


def is_official_url(url: str) -> bool:
    host = urlparse(url).netloc
    return host.endswith(".gov.in") or host.endswith(".nic.in")


async def upsert_source_and_chunks(
    source: dict[str, str],
    content_hash: str,
    mime_type: str,
    chunks: list[Chunk],
    embeddings: list[list[float]],
) -> tuple[bool, int]:
    settings = get_settings()
    if not settings.knowledge_database_url:
        return False, 0

    async with await psycopg.AsyncConnection.connect(settings.knowledge_database_url) as conn:
        await register_vector_async(conn)
        async with conn.cursor() as cur:
            is_official = is_official_url(source["url"])
            host = urlparse(source["url"]).netloc

            await cur.execute(
                """
                INSERT INTO knowledge.sources (
                    url, host, title, kind, authority_slug, is_official, status,
                    jurisdiction_level, state, city
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'active', %s, %s, %s)
                ON CONFLICT (url) DO UPDATE SET
                    title = EXCLUDED.title,
                    kind = EXCLUDED.kind,
                    authority_slug = EXCLUDED.authority_slug,
                    status = 'active',
                    last_checked_at = now()
                RETURNING id
            """,
                (
                    source["url"],
                    host,
                    source["title"],
                    source["kind"],
                    source.get("authoritySlug"),
                    is_official,
                    source["jurisdictionLevel"],
                    source.get("state"),
                    source.get("city"),
                ),
            )
            row = await cur.fetchone()
            if not row:
                raise Exception("Failed to insert/update source")
            source_id = row[0]

            await cur.execute(
                """
                SELECT id FROM knowledge.source_versions
                WHERE source_id = %s AND content_hash = %s
            """,
                (source_id, content_hash),
            )
            existing_version = await cur.fetchone()

            if existing_version:
                return False, 0

            await cur.execute(
                """
                UPDATE knowledge.source_versions
                SET is_current = false
                WHERE source_id = %s
            """,
                (source_id,),
            )

            await cur.execute(
                """
                INSERT INTO knowledge.source_versions (
                    source_id, content_hash, mime_type, is_current
                )
                VALUES (%s, %s, %s, true)
                RETURNING id
            """,
                (source_id, content_hash, mime_type),
            )
            v_row = await cur.fetchone()
            if not v_row:
                raise Exception("Failed to insert source_version")
            version_id = v_row[0]

            for chunk, emb in zip(chunks, embeddings):
                await cur.execute(
                    """
                    INSERT INTO knowledge.chunks (
                        source_version_id, ordinal, section_path, text, language,
                        embedding, embedding_model
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                    (
                        version_id,
                        chunk.ordinal,
                        chunk.section_path or None,
                        chunk.text,
                        source.get("language", "en"),
                        emb,
                        settings.gemini_embed_model,
                    ),
                )

            await conn.commit()
            return True, len(chunks)
