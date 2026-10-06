from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.ai.client import AIClientError, AIResponseError, AIRuntimeUnavailableError
from app.ai.service import AIInputError

router = APIRouter(prefix="/ai", tags=["ai"])


class AIChatRequest(BaseModel):
    message: str


class AIChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=AIChatResponse)
async def chat_with_ai(request: Request, payload: AIChatRequest) -> AIChatResponse:
    """Generate one concise response from the configured local AI runtime."""

    try:
        response = await request.app.state.ai_service.generate_response(
            payload.message
        )
    except AIInputError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message must not be empty",
        ) from None
    except AIRuntimeUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local AI runtime is unavailable",
        ) from None
    except AIResponseError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The local AI runtime returned an invalid response",
        ) from None
    except AIClientError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The local AI runtime request failed",
        ) from None

    return AIChatResponse(response=response)
