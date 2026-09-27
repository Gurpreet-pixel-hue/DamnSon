import re
from dataclasses import dataclass


@dataclass
class Chunk:
    ordinal: int
    section_path: str
    text: str


def chunk_text(text: str, max_tokens: int = 400) -> list[Chunk]:
    max_chars = max_tokens * 4
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current_text = ""
    ordinal = 0

    for p in paragraphs:
        p = p.strip()
        if not p:
            continue

        if len(current_text) + len(p) > max_chars and current_text:
            chunks.append(Chunk(ordinal=ordinal, section_path="", text=current_text.strip()))
            ordinal += 1
            current_text = p
        else:
            if current_text:
                current_text += "\n\n" + p
            else:
                current_text = p

    if current_text:
        chunks.append(Chunk(ordinal=ordinal, section_path="", text=current_text.strip()))

    return chunks
