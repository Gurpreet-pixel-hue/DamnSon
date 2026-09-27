from google import genai

from civicweave_ai.settings import get_settings


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    result = client.models.embed_content(
        model=settings.gemini_embed_model,
        contents=texts,
        config={"output_dimensionality": settings.embed_dim},
    )
    if not result.embeddings:
        return []

    # Cast to ensure mypy knows it's a list of floats
    out: list[list[float]] = []
    for e in result.embeddings:
        if e.values:
            out.append(list(e.values))
        else:
            out.append([])
    return out
