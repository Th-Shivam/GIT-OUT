from collections.abc import Mapping
from typing import Any

import httpx

from app.core.config import Settings


class GitHubClientError(Exception):
    """Base error for expected GitHub API failures."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class GitHubAuthenticationError(GitHubClientError):
    """The GitHub token is missing or was rejected."""


class GitHubForbiddenError(GitHubClientError):
    """GitHub refused the request because of permissions or rate limits."""


class GitHubNotFoundError(GitHubClientError):
    """The requested GitHub resource does not exist."""


class GitHubUpstreamError(GitHubClientError):
    """GitHub could not be reached or returned an upstream failure."""


class GitHubClient:
    """Small async HTTP client for the GitHub REST API."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def get(
        self,
        path: str,
        params: Mapping[str, str | int] | None = None,
    ) -> Any:
        """Perform an authenticated GET request without exposing credentials."""

        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("GitHub request paths must be API-relative")

        token = (
            self._settings.github_token.get_secret_value().strip()
            if self._settings.github_token
            else ""
        )
        if not token:
            raise GitHubAuthenticationError("GitHub token is not configured")

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
        }

        try:
            async with httpx.AsyncClient(
                base_url=self._settings.github_api_base_url.rstrip("/"),
                headers=headers,
                timeout=self._settings.github_timeout_seconds,
            ) as client:
                response = await client.get(path, params=params)
        except httpx.TimeoutException:
            raise GitHubUpstreamError("GitHub request timed out") from None
        except httpx.RequestError:
            raise GitHubUpstreamError("GitHub request failed") from None

        if response.status_code == 401:
            raise GitHubAuthenticationError(
                "GitHub authentication failed",
                status_code=response.status_code,
            )
        if response.status_code == 403:
            raise GitHubForbiddenError(
                "GitHub access was forbidden",
                status_code=response.status_code,
            )
        if response.status_code == 404:
            raise GitHubNotFoundError(
                "GitHub resource was not found",
                status_code=response.status_code,
            )
        if response.status_code == 429 or response.status_code >= 500:
            raise GitHubUpstreamError(
                "GitHub API returned an upstream failure",
                status_code=response.status_code,
            )
        if not response.is_success:
            raise GitHubClientError(
                "GitHub API request failed",
                status_code=response.status_code,
            )

        try:
            return response.json()
        except ValueError:
            raise GitHubClientError("GitHub returned invalid JSON") from None
