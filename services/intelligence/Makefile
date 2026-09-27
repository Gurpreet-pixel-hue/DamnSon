.PHONY: dev lint typecheck test ingest eval

dev:
	uv run uvicorn civicweave_ai.main:app --reload --host 0.0.0.0 --port 8000

lint:
	uv run ruff check src/ tests/
	uv run ruff format --check src/ tests/

typecheck:
	uv run mypy src/ tests/

test:
	uv run pytest

ingest:
	@echo "Ingestion not implemented yet"

eval:
	@echo "Evals not implemented yet"
