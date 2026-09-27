import psycopg
from fastapi import APIRouter
from pydantic import BaseModel

from civicweave_ai.llm.router import get_available_provider
from civicweave_ai.settings import get_settings

router = APIRouter()


class HealthResponse(BaseModel):
    ok: bool
    llm: str
    db: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    settings = get_settings()
    db_status = "down"

    if settings.knowledge_database_url:
        try:
            async with await psycopg.AsyncConnection.connect(
                settings.knowledge_database_url, timeout=1
            ) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT 1")
                    db_status = "up"
        except Exception:
            pass

    llm_status = get_available_provider()
    ok = db_status == "up" and llm_status != "rules"
    return HealthResponse(ok=ok, llm=llm_status, db=db_status)
