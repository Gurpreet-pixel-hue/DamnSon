from typing import Any

import pytest

from civicweave_ai.ingestion.chunk import chunk_text
from civicweave_ai.ingestion.run import process_registry


def test_chunk_splitting() -> None:
    text = "# Heading 1\n\nShort paragraph.\n\n# Heading 2\n\n" + "A" * 2000
    chunks = chunk_text(text, max_tokens=100)  # max 400 chars

    assert chunks[0].section_path == "# Heading 1"
    assert chunks[0].text == "Short paragraph."

    # 2000 A's chunked by 400
    assert chunks[1].section_path == "# Heading 2"
    assert chunks[1].text == "A" * 400
    assert chunks[2].text == "A" * 400
    assert len(chunks) == 6  # 1 for short, 5 for the long one


@pytest.mark.asyncio
async def test_manual_text_loading(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    # 1. Create a dummy file
    test_file = tmp_path / "test.md"
    test_file.write_text("# Test Title\\n\\nSome manual text here.")

    registry = [{"url": "https://test.gov.in/manual", "manualText": str(test_file.absolute())}]

    # We must mock db and embed_texts to avoid actual calls
    async def mock_is_content_unchanged(url: str, h: str) -> bool:
        return False

    async def mock_upsert(*args: Any) -> tuple[bool, int]:
        return True, 1

    def mock_embed(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        return [[0.1] * 768 for _ in texts]

    import civicweave_ai.ingestion.db as db_mod
    import civicweave_ai.ingestion.run as run_mod

    monkeypatch.setattr(db_mod, "is_content_unchanged", mock_is_content_unchanged)
    monkeypatch.setattr(run_mod, "upsert_source_and_chunks", mock_upsert)
    monkeypatch.setattr(run_mod, "embed_texts", mock_embed)

    results = await process_registry(registry, repo_root="")

    assert len(results) == 1
    assert results[0]["url"] == "https://test.gov.in/manual"
    assert results[0]["status"] == "updated"
    assert results[0]["chunks"] == 1


@pytest.mark.asyncio
async def test_unchanged_content_skip(monkeypatch: pytest.MonkeyPatch) -> None:

    async def mock_is_content_unchanged(url: str, h: str) -> bool:
        return True

    import civicweave_ai.ingestion.db as db_mod
    import civicweave_ai.ingestion.run as run_mod

    monkeypatch.setattr(db_mod, "is_content_unchanged", mock_is_content_unchanged)

    # If it skips, it won't even read the dummy.md file because it hashes first... wait,
    # it reads the file FIRST then hashes, then checks `is_content_unchanged`.
    # Let's mock the file read by monkeypatching `open` or using a real dummy file.

    # Or test fetch_url
    registry2 = [{"url": "https://test.gov.in/fetchskip"}]

    def mock_fetch(url: str) -> tuple[bytes, str, str]:
        return b"content", "text/plain", "testhash123"

    monkeypatch.setattr(run_mod, "fetch_url", mock_fetch)

    results = await process_registry(registry2, repo_root="")
    assert len(results) == 1
    assert results[0]["url"] == "https://test.gov.in/fetchskip"
    assert results[0]["status"] == "unchanged"
    assert results[0]["chunks"] == 0
