from typing import Any, Literal
from urllib.parse import quote

from app.github.client import GitHubClient, GitHubClientError


class GitHubService:
    """Application-facing operations backed by the GitHub REST client."""

    def __init__(self, client: GitHubClient) -> None:
        self._client = client

    async def get_authenticated_user(self) -> dict[str, Any]:
        user = await self._client.get("/user")
        if not isinstance(user, dict):
            raise GitHubClientError("GitHub returned an unexpected user response")
        return user

    async def _get_list(
        self,
        path: str,
        params: dict[str, str | int],
    ) -> list[dict[str, Any]]:
        items = await self._client.get(path, params=params)
        if not isinstance(items, list) or not all(
            isinstance(item, dict) for item in items
        ):
            raise GitHubClientError("GitHub returned an unexpected list response")
        return items

    async def get_repositories(
        self,
        *,
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        return await self._get_list(
            "/user/repos",
            params={"page": page, "per_page": per_page, "sort": "updated"},
        )

    async def get_issues(
        self,
        *,
        state: Literal["open", "closed", "all"] = "open",
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        """List assigned issues, excluding PRs included in GitHub's issue feed."""

        issues = await self._get_list(
            "/issues",
            params={
                "state": state,
                "page": page,
                "per_page": per_page,
            },
        )
        return [issue for issue in issues if "pull_request" not in issue]

    async def get_pull_requests(
        self,
        owner: str,
        repository: str,
        *,
        state: Literal["open", "closed", "all"] = "open",
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        return await self._get_list(
            f"/repos/{quote(owner, safe='')}/{quote(repository, safe='')}/pulls",
            params={
                "state": state,
                "page": page,
                "per_page": per_page,
            },
        )

    async def get_commits(
        self,
        owner: str,
        repository: str,
        *,
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        return await self._get_list(
            f"/repos/{quote(owner, safe='')}/{quote(repository, safe='')}/commits",
            params={"page": page, "per_page": per_page},
        )
