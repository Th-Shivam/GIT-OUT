export interface GitHubProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  updated_at: string | null;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  repository_url: string | null;
  updated_at: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  draft: boolean;
  updated_at: string | null;
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  message: string;
  author: string | null;
}

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export class GitHubApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`);
  } catch {
    throw new GitHubApiError(0, 'The GitHub service could not be reached. Check the backend URL and connection.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new GitHubApiError(response.status, 'GitHub is not connected. Add the token to the backend environment and retry.');
    if (response.status === 403) throw new GitHubApiError(response.status, 'GitHub refused this request. Check token permissions or rate limits.');
    throw new GitHubApiError(response.status, 'GitHub is temporarily unavailable. Retry when the backend is online.');
  }
  return response.json() as Promise<T>;
}

export const githubApi = {
  profile: () => request<GitHubProfile>('/github/me'),
  repositories: () => request<GitHubRepository[]>('/github/repos?per_page=30'),
  issues: () => request<GitHubIssue[]>('/github/issues?state=open&per_page=30'),
  pullRequests: (owner: string, repository: string) => request<GitHubPullRequest[]>(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?state=open&per_page=10`),
  commits: (owner: string, repository: string) => request<GitHubCommit[]>(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?per_page=10`),
};
