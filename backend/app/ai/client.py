from collections.abc import Mapping, Sequence
from typing import Any

import httpx

from app.core.config import Settings


class AIClientError(Exception):
    """Base error for expected local AI runtime failures."""


class AIRuntimeUnavailableError(AIClientError):
    """The configured local AI runtime could not be reached or used."""


class AIResponseError(AIClientError):
    """The local AI runtime returned an unusable response."""


class OllamaClient:
    """Async Ollama HTTP client kept behind the application AI interface."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def chat(self, messages: Sequence[Mapping[str, str]]) -> str:
        """Generate one non-streaming response from the configured Ollama model."""

        payload = {
            "model": self._settings.ollama_model,
            "messages": list(messages),
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(
                base_url=self._settings.ollama_base_url.rstrip("/"),
                timeout=self._settings.ollama_timeout_seconds,
            ) as client:
                response = await client.post("/api/chat", json=payload)
        except httpx.TimeoutException:
            raise AIRuntimeUnavailableError(
                "The local AI runtime timed out"
            ) from None
        except httpx.RequestError:
            raise AIRuntimeUnavailableError(
                "The local AI runtime is unavailable"
            ) from None

        if not response.is_success:
            raise AIRuntimeUnavailableError(
                "The local AI runtime returned an error"
            ) from None

        try:
            body: Any = response.json()
        except ValueError:
            raise AIResponseError(
                "The local AI runtime returned invalid JSON"
            ) from None

        if not isinstance(body, dict):
            raise AIResponseError(
                "The local AI runtime returned an unexpected response"
            )

        message = body.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise AIResponseError(
                "The local AI runtime returned no assistant text"
            )

        return content.strip()
