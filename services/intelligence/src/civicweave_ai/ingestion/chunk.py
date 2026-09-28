import re
from dataclasses import dataclass


@dataclass
class Chunk:
    ordinal: int
    section_path: str
    text: str


def chunk_text(text: str, max_tokens: int = 400) -> list[Chunk]:
    max_chars = max_tokens * 4

    # 1. Split by headings (assumes markdown '# Heading' style or fallback to paragraphs)
    # A simple way is to use regex to split blocks that start with #
    # But text might not have markdown headings.
    # Let's split by regex that captures lines starting with one or more #
    parts = re.split(r"(?m)^(#+\s+.*)\n", text)

    # parts will be [pre-heading text, heading1, text1, heading2, text2, ...]
    blocks = []

    # The first element is text before any heading
    if parts[0].strip():
        blocks.append(("", parts[0]))

    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        content = parts[i + 1] if i + 1 < len(parts) else ""
        if content.strip():
            blocks.append((heading, content))

    # If no headings were found, fallback to just the raw text
    if not blocks and text.strip():
        blocks.append(("", text))

    chunks = []
    ordinal = 0

    for heading, content in blocks:
        # 2. Split each block by paragraphs
        paragraphs = re.split(r"\n\s*\n", content)
        current_text = ""

        for p in paragraphs:
            p = p.strip()
            if not p:
                continue

            # If a single paragraph is larger than max_chars, we must split it by sentences/words
            # For simplicity, we just chunk it by max_chars if it's too big
            if len(p) > max_chars:
                # Flush current text if any
                if current_text:
                    chunks.append(Chunk(ordinal=ordinal, section_path=heading, text=current_text.strip()))
                    ordinal += 1
                    current_text = ""

                # Hard split the giant paragraph
                idx = 0
                while idx < len(p):
                    chunk_str = p[idx : idx + max_chars]
                    chunks.append(Chunk(ordinal=ordinal, section_path=heading, text=chunk_str.strip()))
                    ordinal += 1
                    idx += max_chars
                continue

            if len(current_text) + len(p) > max_chars and current_text:
                chunks.append(Chunk(ordinal=ordinal, section_path=heading, text=current_text.strip()))
                ordinal += 1
                current_text = p
            else:
                if current_text:
                    current_text += "\n\n" + p
                else:
                    current_text = p

        if current_text:
            chunks.append(Chunk(ordinal=ordinal, section_path=heading, text=current_text.strip()))
            ordinal += 1

    return chunks
