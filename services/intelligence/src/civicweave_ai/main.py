from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from civicweave_ai.api.copilot import router as copilot_router
from civicweave_ai.api.health import router as health_router
from civicweave_ai.api.search import router as search_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup tasks
    yield
    # Shutdown tasks


app = FastAPI(title="CivicWeave Intelligence", lifespan=lifespan)

app.include_router(health_router)
app.include_router(search_router)
app.include_router(copilot_router)
