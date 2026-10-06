from typing import Literal

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: Literal["git-out-backend"]
    database: Literal["connected", "unavailable"]


@router.get(
    "/health",
    response_model=HealthResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
)
async def health(request: Request) -> HealthResponse | JSONResponse:
    """Report backend availability and MongoDB connectivity."""

    database = await request.app.state.mongodb.check_connection()
    if database:
        return HealthResponse(
            status="ok",
            service="git-out-backend",
            database="connected",
        )

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=HealthResponse(
            status="degraded",
            service="git-out-backend",
            database="unavailable",
        ).model_dump(),
    )
