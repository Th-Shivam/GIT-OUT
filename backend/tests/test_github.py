import asyncio
import logging
from unittest.mock import create_autospec

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.mongodb import MongoDB
from app.github.client import GitHubClient, GitHubClientError
from app.github.service import GitHubService
from app.main import create_app


def github_settings(token: str | None = "test-github-token") -> Settings:
    return Settings(
        _env_file=None,
        github_token=token,
        github_api_base_url="https://api.github.com",
        github_timeout_seconds=0.1,
        mongodb_server_selection_timeout_ms=100,
    )


def github_app(token: str | None = "test-github-token") -> FastAPI:
    # Isolate GitHub tests from MongoDB; Phase 1 tests exercise the real driver.
    mongodb = create_autospec(MongoDB, instance=True)
    mongodb.connect.return_value = False
    return create_app(
        settings=github_settings(token),
        mongodb=mongodb,
    )


@respx.mock
def test_github_me_returns_sanitized_user(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    route = respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(
            200,
            json={
                "login": "octocat",
                "name": "The Octocat",
                "avatar_url": "https://github.com/images/error/octocat_happy.gif",
                "public_repos": 8,
                "email": "octocat@github.com",
                "private_gists": 4,
                "token": "should-not-be-returned",
            },
        )
    )

    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == 200
    assert response.json() == {
        "login": "octocat",
        "name": "The Octocat",
        "avatar_url": "https://github.com/images/error/octocat_happy.gif",
        "public_repos": 8,
    }
    request = route.calls[0].request
    assert request.headers["Authorization"] == "Bearer test-github-token"
    assert request.headers["Accept"] == "application/vnd.github+json"
    assert request.headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert request.extensions["timeout"]["read"] == 0.1
    assert "test-github-token" not in response.text
    assert "email" not in response.json()
    assert "token" not in response.json()
    assert "test-github-token" not in caplog.text
    assert "authorization" not in caplog.text.lower()


@pytest.mark.parametrize("token", [None, "", "   "])
@respx.mock
def test_github_me_rejects_missing_token(token: str | None) -> None:
    with TestClient(github_app(token=token)) as client:
        response = client.get("/github/me")

    assert response.status_code == 401
    assert response.json() == {
        "detail": "GitHub authentication is required or invalid"
    }
    assert not respx.calls


@respx.mock
def test_github_me_handles_invalid_token(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(
            401,
            json={"message": "Bad credentials: Bearer test-github-token"},
        )
    )

    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == 401
    assert response.json() == {
        "detail": "GitHub authentication is required or invalid"
    }
    assert "test-github-token" not in response.text
    assert "test-github-token" not in caplog.text
    assert "authorization" not in caplog.text.lower()


@pytest.mark.parametrize(
    ("status_code", "expected_status"),
    [(403, 403), (404, 502), (429, 503), (500, 503), (503, 503)],
)
@respx.mock
def test_github_me_handles_github_failures(
    status_code: int,
    expected_status: int,
) -> None:
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(status_code, json={"message": "failure"})
    )

    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == expected_status
    assert "test-github-token" not in response.text


@pytest.mark.parametrize("error_type", [httpx.ReadTimeout, httpx.ConnectError])
@respx.mock
def test_github_me_handles_network_failures(
    error_type: type[httpx.RequestError],
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    respx.get("https://api.github.com/user").mock(
        side_effect=error_type("upstream failure: Bearer test-github-token")
    )

    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == 503
    assert response.json() == {"detail": "GitHub is temporarily unavailable"}
    assert "test-github-token" not in response.text
    assert "test-github-token" not in caplog.text
    assert "authorization" not in caplog.text.lower()


@respx.mock
def test_github_me_handles_invalid_json() -> None:
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(200, text="invalid test-github-token")
    )
    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == 502
    assert "test-github-token" not in response.text


@respx.mock
def test_github_me_handles_unexpected_user_response() -> None:
    respx.get("https://api.github.com/user").mock(
        return_value=httpx.Response(200, json={"login": "test-github-token"})
    )
    with TestClient(github_app()) as client:
        response = client.get("/github/me")

    assert response.status_code == 502
    assert response.json() == {
        "detail": "GitHub returned an unexpected user response"
    }
    assert "test-github-token" not in response.text


@respx.mock
def test_github_browse_endpoints_return_safe_read_models() -> None:
    respx.get("https://api.github.com/user/repos").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 7,
                    "name": "git-out",
                    "full_name": "octocat/git-out",
                    "private": False,
                    "description": "A voice-first companion",
                    "html_url": "https://github.com/octocat/git-out",
                    "language": "TypeScript",
                    "stargazers_count": 3,
                    "open_issues_count": 2,
                    "updated_at": "2026-10-10T00:00:00Z",
                    "owner": {"login": "octocat", "token": "secret"},
                }
            ],
        )
    )
    respx.get("https://api.github.com/issues").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": 8,
                    "number": 4,
                    "title": "Add offline docs",
                    "state": "open",
                    "html_url": "https://github.com/octocat/git-out/issues/4",
                    "repository_url": "https://api.github.com/repos/octocat/git-out",
                }
            ],
        )
    )

    with TestClient(github_app()) as client:
        repositories = client.get("/github/repos", params={"per_page": 5})
        issues = client.get("/github/issues")

    assert repositories.status_code == 200
    assert repositories.json()[0]["full_name"] == "octocat/git-out"
    assert "owner" not in repositories.json()[0]
    assert issues.status_code == 200
    assert issues.json()[0]["title"] == "Add offline docs"


@respx.mock
def test_github_commit_endpoint_flattens_commit_metadata() -> None:
    respx.get("https://api.github.com/repos/octocat/git-out/commits").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "sha": "abc123",
                    "html_url": "https://github.com/octocat/git-out/commit/abc123",
                    "commit": {
                        "message": "Improve Pocket Mode\n\nDetails",
                        "author": {"name": "Octocat", "email": "private@example.com"},
                    },
                }
            ],
        )
    )

    with TestClient(github_app()) as client:
        response = client.get("/github/repos/octocat/git-out/commits")

    assert response.status_code == 200
    assert response.json() == [
        {
            "sha": "abc123",
            "html_url": "https://github.com/octocat/git-out/commit/abc123",
            "message": "Improve Pocket Mode",
            "author": "Octocat",
        }
    ]


@pytest.mark.parametrize(
    ("method", "arguments", "path", "params"),
    [
        (
            "get_repositories",
            {},
            "/user/repos",
            {"page": 2, "per_page": 5, "sort": "updated"},
        ),
        (
            "get_issues",
            {"state": "closed"},
            "/issues",
            {"page": 2, "per_page": 5, "state": "closed"},
        ),
        (
            "get_pull_requests",
            {"owner": "octocat", "repository": "git-out", "state": "all"},
            "/repos/octocat/git-out/pulls",
            {"page": 2, "per_page": 5, "state": "all"},
        ),
        (
            "get_commits",
            {"owner": "octocat", "repository": "git-out"},
            "/repos/octocat/git-out/commits",
            {"page": 2, "per_page": 5},
        ),
    ],
)
@respx.mock
def test_github_service_uses_expected_endpoints(
    method: str,
    arguments: dict[str, str],
    path: str,
    params: dict[str, str | int],
) -> None:
    route = respx.get(f"https://api.github.com{path}", params=params).mock(
        return_value=httpx.Response(200, json=[{"id": 1}])
    )
    service = GitHubService(GitHubClient(github_settings()))
    result = asyncio.run(getattr(service, method)(**arguments, page=2, per_page=5))

    assert result == [{"id": 1}]
    assert route.called


@respx.mock
def test_github_issues_excludes_pull_requests() -> None:
    respx.get("https://api.github.com/issues").mock(
        return_value=httpx.Response(
            200,
            json=[{"id": 1}, {"id": 2, "pull_request": {"url": "pr-url"}}],
        )
    )
    service = GitHubService(GitHubClient(github_settings()))

    assert asyncio.run(service.get_issues()) == [{"id": 1}]


@respx.mock
def test_github_client_errors_do_not_expose_credentials() -> None:
    respx.get("https://api.github.com/user").mock(
        side_effect=httpx.ConnectError("Authorization: Bearer test-github-token")
    )
    with pytest.raises(GitHubClientError) as error:
        asyncio.run(GitHubClient(github_settings()).get("/user"))

    assert "test-github-token" not in str(error.value)
    assert "Authorization" not in str(error.value)


def test_github_token_is_masked_in_settings() -> None:
    settings = github_settings()

    assert "test-github-token" not in repr(settings)
    assert "test-github-token" not in settings.model_dump_json()
