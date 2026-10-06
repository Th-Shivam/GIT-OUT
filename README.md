# Git Out

Git Out is a voice-first AI companion that helps developers discuss GitHub
work, review code, and practice technical conversations while walking.

## Current architecture

- `frontend/` — React Native + Expo + TypeScript mobile client.
- `backend/` — Python + FastAPI service with async MongoDB connectivity, a
  database-aware health endpoint, and a GitHub REST integration.
- `docs/` — Project documentation.
- `scripts/` — Small development and automation scripts.

The current request path is:

```text
React Native / Expo
        ↓
FastAPI
        ↓
MongoDB
```

The initial foundation uses REST between the mobile client and API. GitHub
calls follow route → service → async HTTP client → GitHub API, without storing
GitHub data in MongoDB. Authentication, realtime voice, and AI model
integrations will be added in later phases. The planned AI architecture
supports local, open-weight
inference through Ollama, with Whisper/faster-whisper for speech recognition
and Kokoro or Piper for speech synthesis.

## Technology stack

- React Native, Expo, and TypeScript
- Python and FastAPI
- MongoDB with PyMongo's async driver
- GitHub REST API integration
- Open-weight AI with local inference support (planned)

## Development setup

Copy the service environment templates before adding local configuration:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The root `.env.example` lists the project-wide configuration planned for later
phases. The templates contain no secrets. Keep local `.env` files uncommitted.

### Frontend

```bash
cd frontend
npm install
npm start
```

Use the Expo CLI output to open the app in Expo Go, an emulator, or a
development build. The web target is also available with `npm run web`.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Git Out expects a MongoDB instance at the `MONGODB_URI` configured in
`backend/.env`. The API starts if MongoDB is unavailable, but reports a
degraded state until the database can be reached. Add a GitHub Personal
Access Token to `GITHUB_TOKEN` for GitHub API requests. Keep the token local
and never commit it.

The API is available at `http://localhost:8000`; its health check is
`GET /health`. Run backend tests with:

```bash
pytest
```

The default test suite covers the unavailable-database path. The MongoDB
integration check runs against the configured URI and is skipped when no
MongoDB instance is available.

The GitHub integration can be checked with `GET /github/me` when a real token
is configured. The response contains only the authenticated user's login,
name, avatar URL, and public repository count. Live GitHub testing requires a
real local token; automated tests use mocked GitHub responses.

```bash
curl http://localhost:8000/github/me
```

`GITHUB_API_BASE_URL` defaults to `https://api.github.com` and
`GITHUB_TIMEOUT_SECONDS` defaults to 10. The token belongs to the backend's
configured GitHub account; this phase does not add OAuth or per-user login.
The service also supports paginated repositories, assigned issues (excluding
PRs), repository pull requests, and repository commits. These methods fetch
one page per call; only the profile route is exposed in this phase.

GitHub error responses use stable, sanitized messages:

| Condition | API HTTP status |
| --- | --- |
| Missing, empty, or rejected token / GitHub 401 | 401 |
| GitHub 403 (permissions or rate limit) | 403 |
| GitHub 404, other unexpected status, or malformed response | 502 |
| GitHub 429, 5xx, timeout, or network failure | 503 |
