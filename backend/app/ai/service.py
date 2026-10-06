from collections.abc import Mapping, Sequence
from typing import Protocol, TypedDict


class AIMessage(TypedDict):
    role: str
    content: str

DEFAULT_SYSTEM_PROMPT = (
    "You are Git Out, a voice-first AI companion for developers. "
    "Help developers think about coding, GitHub work, technical concepts, "
    "and interview preparation while they are away from their screen. "
    "Keep responses conversational and concise. Do not encourage unnecessary "
    "screen usage. Do not claim access to GitHub data unless it is explicitly "
    "provided through tools or context."
)


class AIChatClient(Protocol):
    async def chat(self, messages: Sequence[Mapping[str, str]]) -> str:
        """Generate assistant text from a chat message sequence."""


class AIInputError(ValueError):
    """The caller supplied an empty or invalid AI message."""


class AIService:
    """Provider-neutral application service for one-shot AI responses."""

    def __init__(self, client: AIChatClient) -> None:
        self._client = client

    async def generate_response(
        self,
        user_message: str,
        system_prompt: str | None = None,
    ) -> str:
        message = user_message.strip()
        if not message:
            raise AIInputError("Message must not be empty")

        prompt = (system_prompt or DEFAULT_SYSTEM_PROMPT).strip()
        if not prompt:
            prompt = DEFAULT_SYSTEM_PROMPT

        messages: list[AIMessage] = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": message},
        ]
        return await self._client.chat(messages)
