import asyncio
import json
import logging
from unittest.mock import create_autospec

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.client import AIClientError, OllamaClient
from app.ai.service import AIService
from app.core.config import Settings
from app.db.mongodb import MongoDB
from app.main import create_app


def ai_settings() -> Settings:
    return Settings(
        _env_file=None,
        ollama_base_url="http://localhost:11434",
        ollama_model="qwen3:4b-test",
        ollama_timeout_seconds=0.1,
        mongodb_server_selection_timeout_ms=100,
    )


def ai_app() -> FastAPI:
    mongodb = create_autospec(MongoDB, instance=True)
    mongodb.connect.return_value = False
    settings = ai_settings()
    return create_app(
        settings=settings,
        mongodb=mongodb,
        ai_service=AIService(OllamaClient(settings)),
    )


def ollama_response(content: str = "Git is a version control system.") -> dict:
    return {
        "model": "qwen3:4b-test",
        "message": {
            "role": "assistant",
            "content": content,
            "thinking": "internal model detail",
        },
        "done": True,
        "secret": "must not leak",
    }


@respx.mock
def test_ai_chat_returns_only_assistant_text() -> None:
    route = respx.post("http://localhost:11434/api/chat").mock(
        return_value=httpx.Response(200, json=ollama_response())
    )

    with TestClient(ai_app()) as client:
        response = client.post(
            "/ai/chat",
            json={"message": "Explain Git in one sentence"},
        )

    assert response.status_code == 200
    assert response.json() == {"response": "Git is a version control system."}
    assert route.called
    assert "thinking" not in response.text
    assert "secret" not in response.text


@respx.mock
def test_ai_chat_sends_system_prompt_and_configured_model() -> None:
    route = respx.post("http://localhost:11434/api/chat").mock(
        return_value=httpx.Response(200, json=ollama_response("Concise answer."))
    )

    with TestClient(ai_app()) as client:
        response = client.post("/ai/chat", json={"message": "What is a PR?"})

    body = json.loads(route.calls[0].request.content)
    assert response.status_code == 200
    assert body["model"] == "qwen3:4b-test"
    assert body["stream"] is False
    assert body["messages"] == [
        {
            "role": "system",
            "content": (
                "You are Git Out, a voice-first AI companion for developers. "
                "Help developers think about coding, GitHub work, technical concepts, "
                "and interview preparation while they are away from their screen. "
                "Keep responses conversational and concise. Do not encourage unnecessary "
                "screen usage. Do not claim access to GitHub data unless it is explicitly "
                "provided through tools or context."
            ),
        },
        {"role": "user", "content": "What is a PR?"},
    ]


@pytest.mark.parametrize("message", ["", "   ", "\n\t"])
@respx.mock
def test_ai_chat_rejects_empty_message(message: str) -> None:
    with TestClient(ai_app()) as client:
        response = client.post("/ai/chat", json={"message": message})

    assert response.status_code == 400
    assert response.json() == {"detail": "Message must not be empty"}
    assert not respx.calls


@pytest.mark.parametrize(
    "error_type",
    [httpx.ConnectError, httpx.ReadTimeout],
)
@respx.mock
def test_ai_chat_handles_runtime_network_failures(
    error_type: type[httpx.RequestError],
) -> None:
    respx.post("http://localhost:11434/api/chat").mock(
        side_effect=error_type("local runtime failure")
    )

    with TestClient(ai_app()) as client:
        response = client.post("/ai/chat", json={"message": "Hello"})

    assert response.status_code == 503
    assert response.json() == {"detail": "The local AI runtime is unavailable"}


@respx.mock
def test_ai_chat_handles_ollama_http_error() -> None:
    respx.post("http://localhost:11434/api/chat").mock(
        return_value=httpx.Response(500, json={"error": "runtime detail"})
    )

    with TestClient(ai_app()) as client:
        response = client.post("/ai/chat", json={"message": "Hello"})

    assert response.status_code == 503
    assert response.json() == {"detail": "The local AI runtime is unavailable"}
    assert "runtime detail" not in response.text


@pytest.mark.parametrize(
    "body",
    [
        "not-json",
        {},
        {"message": {"content": 123}},
        {"message": {"content": "   "}},
    ],
)
@respx.mock
def test_ai_chat_handles_malformed_ollama_response(body: object) -> None:
    response = (
        httpx.Response(200, text=body)
        if isinstance(body, str)
        else httpx.Response(200, json=body)
    )
    respx.post("http://localhost:11434/api/chat").mock(return_value=response)

    with TestClient(ai_app()) as client:
        result = client.post("/ai/chat", json={"message": "Hello"})

    assert result.status_code == 502
    assert result.json() == {
        "detail": "The local AI runtime returned an invalid response"
    }


def test_ai_service_rejects_empty_message_without_runtime_call() -> None:
    client = create_autospec(OllamaClient, instance=True)
    service = AIService(client)

    with pytest.raises(ValueError, match="Message must not be empty"):
        asyncio.run(service.generate_response("  "))

    client.chat.assert_not_called()


def test_ai_token_like_content_is_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    client = create_autospec(OllamaClient, instance=True)
    client.chat.side_effect = AIClientError("runtime failure")
    service = AIService(client)

    with pytest.raises(AIClientError):
        asyncio.run(service.generate_response("private test prompt"))

    assert "private test prompt" not in caplog.text
