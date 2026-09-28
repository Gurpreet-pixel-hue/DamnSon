FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY services/intelligence/pyproject.toml services/intelligence/uv.lock services/intelligence/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/intelligence/src/ src/
# Package data files
COPY docs/contract/facts.json docs/contract/
COPY data/gazetteer/maharashtra.json data/gazetteer/
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
CMD ["sh", "-c", "exec uvicorn civicweave_ai.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
