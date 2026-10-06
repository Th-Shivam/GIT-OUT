import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from app.ai.client import OllamaClient
from app.ai.service import AIService
from app.api.routes.ai import router as ai_router
from app.api.routes.github import router as github_router
from app.api.routes.health import router as health_router
from app.core.config import Settings, get_settings
from app.db.mongodb import MongoDB

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Connect to MongoDB at startup and close it during shutdown."""

    connected = await app.state.mongodb.connect()
    if not connected:
        logger.warning("Git Out API started with a degraded database state")

    try:
        yield
    finally:
        await app.state.mongodb.close()


def create_app(
    settings: Settings | None = None,
    mongodb: MongoDB | None = None,
    ai_service: AIService | None = None,
) -> FastAPI:
    """Create the FastAPI application with injectable infrastructure."""

    resolved_settings = settings or get_settings()
    resolved_mongodb = mongodb or MongoDB(resolved_settings)
    resolved_ai_service = ai_service or AIService(OllamaClient(resolved_settings))
    application = FastAPI(
        title="Git Out API",
        description="Backend services for the Git Out voice-first AI companion.",
        version="0.1.0",
        debug=resolved_settings.debug,
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.mongodb = resolved_mongodb
    application.state.ai_service = resolved_ai_service
    application.include_router(health_router)
    application.include_router(github_router)
    application.include_router(ai_router)
    return application


app = create_app()
