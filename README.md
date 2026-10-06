# Git Out

Git Out is a voice-first AI companion that helps developers discuss GitHub
work, review code, and practice technical conversations while walking.

## Current architecture

- `frontend/` — React Native + Expo + TypeScript mobile client.
- `backend/` — Python + FastAPI service with async MongoDB connectivity and a
  database-aware health endpoint.
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

The initial foundation uses REST between the mobile client and API. GitHub,
authentication, realtime voice, and AI model integrations will be added in
later phases. The planned AI architecture supports local, open-weight
inference through Ollama, with Whisper/faster-whisper for speech recognition
and Kokoro or Piper for speech synthesis.

## Technology stack

- React Native, Expo, and TypeScript
- Python and FastAPI
- MongoDB with PyMongo's async driver
- GitHub API (planned)
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
degraded state until the database can be reached.

The API is available at `http://localhost:8000`; its health check is
`GET /health`. Run backend tests with:

```bash
pytest
```

The default test suite covers the unavailable-database path. The MongoDB
integration check runs against the configured URI and is skipped when no
MongoDB instance is available.
