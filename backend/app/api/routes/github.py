from typing import Any, Literal, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, ValidationError

from app.github.client import (
    GitHubAuthenticationError,
    GitHubClient,
    GitHubClientError,
    GitHubForbiddenError,
    GitHubNotFoundError,
    GitHubUpstreamError,
)
from app.github.service import GitHubService

router = APIRouter(prefix="/github", tags=["github"])


class GitHubUserResponse(BaseModel):
    login: str
    name: str | None = None
    avatar_url: str
    public_repos: int


class GitHubRepositoryResponse(BaseModel):
    id: int
    name: str
    full_name: str
    private: bool = False
    description: str | None = None
    html_url: str
    language: str | None = None
    stargazers_count: int = 0
    open_issues_count: int = 0
    updated_at: str | None = None


class GitHubIssueResponse(BaseModel):
    id: int
    number: int
    title: str
    state: Literal["open", "closed"]
    html_url: str
    repository_url: str | None = None
    updated_at: str | None = None


class GitHubPullRequestResponse(BaseModel):
    id: int
    number: int
    title: str
    state: Literal["open", "closed"]
    html_url: str
    draft: bool = False
    updated_at: str | None = None


class GitHubCommitResponse(BaseModel):
    sha: str
    html_url: str
    message: str
    author: str | None = None


ModelT = TypeVar("ModelT", bound=BaseModel)


def validate_list(items: list[dict[str, Any]], model: type[ModelT]) -> list[ModelT]:
    return [model.model_validate(item) for item in items]


def github_error_response(error: GitHubClientError) -> HTTPException:
    if isinstance(error, GitHubAuthenticationError):
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="GitHub authentication is required or invalid",
        )
    if isinstance(error, GitHubForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="GitHub access was forbidden",
        )
    if isinstance(error, GitHubNotFoundError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub resource was not found",
        )
    if isinstance(error, GitHubUpstreamError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub is temporarily unavailable",
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="GitHub API request failed",
    )


@router.get("/me", response_model=GitHubUserResponse)
async def get_github_user(request: Request) -> GitHubUserResponse:
    """Return a small, safe representation of the authenticated GitHub user."""

    service = GitHubService(GitHubClient(request.app.state.settings))
    try:
        user = await service.get_authenticated_user()
        return GitHubUserResponse.model_validate(user)
    except GitHubClientError as exc:
        raise github_error_response(exc) from None
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub returned an unexpected user response",
        ) from None


@router.get("/repos", response_model=list[GitHubRepositoryResponse])
async def get_github_repositories(
    request: Request,
    page: int = Query(default=1, ge=1, le=10),
    per_page: int = Query(default=30, ge=1, le=50),
) -> list[GitHubRepositoryResponse]:
    service = GitHubService(GitHubClient(request.app.state.settings))
    try:
        return validate_list(
            await service.get_repositories(page=page, per_page=per_page),
            GitHubRepositoryResponse,
        )
    except GitHubClientError as exc:
        raise github_error_response(exc) from None
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub returned an unexpected repository response",
        ) from None


@router.get("/issues", response_model=list[GitHubIssueResponse])
async def get_github_issues(
    request: Request,
    state: Literal["open", "closed", "all"] = Query(default="open"),
    page: int = Query(default=1, ge=1, le=10),
    per_page: int = Query(default=30, ge=1, le=50),
) -> list[GitHubIssueResponse]:
    service = GitHubService(GitHubClient(request.app.state.settings))
    try:
        return validate_list(
            await service.get_issues(state=state, page=page, per_page=per_page),
            GitHubIssueResponse,
        )
    except GitHubClientError as exc:
        raise github_error_response(exc) from None
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub returned an unexpected issue response",
        ) from None


@router.get(
    "/repos/{owner}/{repository}/pulls",
    response_model=list[GitHubPullRequestResponse],
)
async def get_github_pull_requests(
    owner: str,
    repository: str,
    request: Request,
    state: Literal["open", "closed", "all"] = Query(default="open"),
    page: int = Query(default=1, ge=1, le=10),
    per_page: int = Query(default=30, ge=1, le=50),
) -> list[GitHubPullRequestResponse]:
    service = GitHubService(GitHubClient(request.app.state.settings))
    try:
        return validate_list(
            await service.get_pull_requests(
                owner,
                repository,
                state=state,
                page=page,
                per_page=per_page,
            ),
            GitHubPullRequestResponse,
        )
    except GitHubClientError as exc:
        raise github_error_response(exc) from None
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub returned an unexpected pull request response",
        ) from None


@router.get(
    "/repos/{owner}/{repository}/commits",
    response_model=list[GitHubCommitResponse],
)
async def get_github_commits(
    owner: str,
    repository: str,
    request: Request,
    page: int = Query(default=1, ge=1, le=10),
    per_page: int = Query(default=30, ge=1, le=50),
) -> list[GitHubCommitResponse]:
    service = GitHubService(GitHubClient(request.app.state.settings))
    try:
        commits = await service.get_commits(
            owner,
            repository,
            page=page,
            per_page=per_page,
        )
        return [
            GitHubCommitResponse(
                sha=commit["sha"],
                html_url=commit["html_url"],
                message=(
                    commit.get("commit", {}).get("message", "").splitlines()[0]
                    if commit.get("commit", {}).get("message", "").splitlines()
                    else ""
                ),
                author=(commit.get("commit", {}).get("author") or {}).get("name"),
            )
            for commit in commits
        ]
    except (KeyError, TypeError, AttributeError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="GitHub returned an unexpected commit response",
        ) from None
    except GitHubClientError as exc:
        raise github_error_response(exc) from None
