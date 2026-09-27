FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ src/
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"
CMD ["sh", "-c", "exec uvicorn civicweave_ai.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
