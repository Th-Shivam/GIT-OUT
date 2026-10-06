from fastapi import APIRouter, HTTPException, Request, status
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
