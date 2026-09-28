import argparse
import hashlib
import json
import os
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


async def process_registry(registry: list[dict[str, Any]], repo_root: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for source in registry:
        try:
            if "manualText" in source:
                manual_path = os.path.join(repo_root, source["manualText"])
                with open(manual_path, "rb") as mf:
                    content = mf.read()
                mime = "text/markdown"
                content_hash = hashlib.sha256(content).hexdigest()
                text = parse_content(content, mime)
            else:
                content, mime, content_hash = fetch_url(source["url"])
                text = parse_content(content, mime)

            from civicweave_ai.ingestion.db import is_content_unchanged

            if await is_content_unchanged(source["url"], content_hash):
                results.append({"url": source["url"], "status": "unchanged", "chunks": 0})
                continue

            if not text.strip():
                results.append({"url": source["url"], "status": "empty text", "chunks": 0})
                continue

            chunks = chunk_text(text)
            if not chunks:
                results.append({"url": source["url"], "status": "no chunks", "chunks": 0})
                continue

            texts_to_embed = [c.text for c in chunks]

            # Batch embedding calls
            embeddings = []
            batch_size = 50
            for i in range(0, len(texts_to_embed), batch_size):
                batch = texts_to_embed[i : i + batch_size]
                batch_embs = embed_texts(batch)
                embeddings.extend(batch_embs)

            # Assert counts and dimensions
            assert len(embeddings) == len(chunks), "Embedding count does not match chunk count"
            for emb in embeddings:
                assert len(emb) == 768, f"Embedding dimension {len(emb)} is not exactly 768"

            updated, chunk_count = await upsert_source_and_chunks(source, content_hash, mime, chunks, embeddings)

            status = "updated" if updated else "unchanged (post-embed)"
            results.append({"url": source["url"], "status": status, "chunks": chunk_count})
        except Exception as e:
            results.append({"url": source["url"], "status": f"error: {e}", "chunks": 0})
            print(f"Error processing {source['url']}: {e}")
    return results


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", required=True)
    args = parser.parse_args()

    registry_path = os.path.abspath(args.registry)
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(registry_path)))

    with open(registry_path) as f:
        registry = json.load(f)

    results = await process_registry(registry, repo_root)
    print_summary(results)
