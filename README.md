# Git Out

Git Out is a voice-first AI companion that helps developers discuss GitHub
work, review code, and practice technical conversations while walking.

## Current architecture

- `frontend/` — React Native + Expo + TypeScript mobile client.
- `backend/` — Python + FastAPI service with the initial health endpoint.
- `docs/` — Project documentation.
- `scripts/` — Small development and automation scripts.

The initial foundation uses REST between the mobile client and API. GitHub,
MongoDB, authentication, realtime voice, and AI model integrations will be
added in later phases. The AI architecture is intended to support local,
open-weight inference through Ollama, with Whisper/faster-whisper for speech
recognition and Kokoro or Piper for speech synthesis.

## Technology stack

- React Native, Expo, and TypeScript
- Python and FastAPI
- MongoDB (planned)
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
uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`; its health check is
`GET /health`.
