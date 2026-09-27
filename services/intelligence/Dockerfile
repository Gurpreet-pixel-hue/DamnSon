FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev
COPY src/ src/
CMD uv run uvicorn civicweave_ai.main:app --host 0.0.0.0 --port ${PORT:-8080}
