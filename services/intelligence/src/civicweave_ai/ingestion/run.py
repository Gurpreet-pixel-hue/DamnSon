import argparse
import asyncio
import json
from typing import Any

from civicweave_ai.embeddings.router import embed_texts
from civicweave_ai.ingestion.chunk import chunk_text
from civicweave_ai.ingestion.db import upsert_source_and_chunks
from civicweave_ai.ingestion.fetch import fetch_url
from civicweave_ai.ingestion.parse import parse_content


def print_summary(results: list[dict[str, Any]]) -> None:
    print(f"\n{'Source URL':<60} | {'Status':<15} | {'Chunks'}")
    print("-" * 90)
    for r in results:
        url_trunc = r["url"][:57] + "..." if len(r["url"]) > 60 else r["url"]
        print(f"{url_trunc:<60} | {r['status']:<15} | {r['chunks']}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", required=True)
    args = parser.parse_args()

    with open(args.registry) as f:
        registry = json.load(f)

    results: list[dict[str, Any]] = []

    for source in registry:
        try:
            content, mime, content_hash = fetch_url(source["url"])
            text = parse_content(content, mime)

            if not text.strip():
                results.append({"url": source["url"], "status": "empty text", "chunks": 0})
                continue

            chunks = chunk_text(text)
            if not chunks:
                results.append({"url": source["url"], "status": "no chunks", "chunks": 0})
                continue

            texts_to_embed = [c.text for c in chunks]
            embeddings = embed_texts(texts_to_embed)

            updated, chunk_count = await upsert_source_and_chunks(source, content_hash, mime, chunks, embeddings)

            status = "updated" if updated else "unchanged"
            results.append({"url": source["url"], "status": status, "chunks": chunk_count})
        except Exception as e:
            results.append({"url": source["url"], "status": f"error: {e}", "chunks": 0})
            print(f"Error processing {source['url']}: {e}")

    print_summary(results)


if __name__ == "__main__":
    asyncio.run(main())
