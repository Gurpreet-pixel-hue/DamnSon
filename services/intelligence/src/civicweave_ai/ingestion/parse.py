import pymupdf
import trafilatura


def parse_html(content: bytes) -> str:
    text = trafilatura.extract(content, include_tables=True, include_links=True)
    return text if text else ""


def parse_pdf(content: bytes) -> str:
    text = ""
    with pymupdf.open(stream=content, filetype="pdf") as doc:  # type: ignore
        for page in doc:
            text += page.get_text() + "\n"
    return text


def parse_content(content: bytes, mime_type: str) -> str:
    if "pdf" in mime_type:
        return parse_pdf(content)
    return parse_html(content)
