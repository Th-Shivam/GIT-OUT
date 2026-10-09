# Git Out

Git Out is a voice-first AI companion that helps developers discuss GitHub
work, review code, and practice technical conversations while walking.

## Current architecture

- `frontend/` — React Native + Expo + TypeScript mobile client with an
  Android-first local LLM spike.
- `backend/` — Python + FastAPI service with async MongoDB connectivity, a
  database-aware health endpoint, GitHub REST integration, and a local AI
  runtime integration.
- `docs/` — Project documentation.
- `scripts/` — Small development and automation scripts.

The current request paths are:

```text
React Native / Expo → FastAPI
                         ├── MongoDB
                         ├── GitHub API
                         └── Ollama (local AI)

React Native / Expo → llama.rn → local GGUF model

React Native / Expo → Android SpeechRecognizer → on-device system speech model
```

The initial foundation uses REST between the mobile client and API. GitHub
calls follow route → service → async HTTP client → GitHub API, without storing
GitHub data in MongoDB. Authentication, realtime voice, and AI model
integrations will be added in later phases. The mobile speech path uses
Android's native on-device recognizer; future speech synthesis may use Kokoro
or Piper.

## Technology stack

- React Native, Expo, and TypeScript
- Python and FastAPI
- MongoDB with PyMongo's async driver
- GitHub REST API integration
- Open-weight AI through a local Ollama runtime

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
development build. The local AI screen requires a native development build;
run `npm run android` with an Android SDK and device/emulator available. The
web target remains available with `npm run web`, but local llama.cpp inference
is Android-only in this spike.

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

### Local open-source AI

Git Out uses Ollama as a replaceable local HTTP runtime for the first AI
integration. The default model is `qwen3:4b`, a small open-weight instruct
model selected for practical local development. Local inference supports
privacy-conscious experimentation and reduces dependence on proprietary AI
APIs, while keeping the model boundary replaceable and supporting open
innovation. GitHub access still requires network connectivity.

Install Ollama from the [official download page](https://ollama.com/download),
then run the local server and pull the configured model:

```bash
# Keep this process running in one terminal.
ollama serve

# Run this in another terminal.
ollama pull qwen3:4b
```

With the backend running, send a non-streaming request to:

```bash
curl -X POST http://localhost:8000/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Give me a one sentence explanation of Git."}'
```

Live AI requests require Ollama and the configured model to be available.
Automated tests mock the Ollama HTTP API and do not download or require a
model.

### Mobile Local AI

The mobile path is independent of FastAPI, Ollama, and `/ai/chat`:

```text
React Native
    ↓
LocalAI interface
    ↓
llama.rn 0.12.9 (llama.cpp)
    ↓
Qwen2.5-1.5B-Instruct Q4_K_M GGUF
```

The selected model is [Qwen2.5-1.5B-Instruct Q4_K_M GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/blob/main/qwen2.5-1.5b-instruct-q4_k_m.gguf):

- 1.54B parameters
- Q4_K_M quantization
- 1,117,320,736 bytes (about 1.04 GiB)
- Apache-2.0 license
- Plan for roughly 2 GiB or more of free app memory; actual use depends on
  device, Android version, context size, and runtime allocation.

The app does not bundle or download model weights. Download the model during
development using the linked model page, place the `.gguf` file in the Android
device's `Download` folder, then use **Choose GGUF** in the local AI screen.
The app copies the selected file into its private `models/` directory. Local
model files and `*.gguf` files are ignored by Git.

Build the native development app with:

```bash
cd frontend
npm install
npx expo prebuild --platform android
npm run android
```

The native runtime is configured for the New Architecture and CPU inference
on `arm64-v8a` and `x86_64`. The screen exposes model loading, unload, prompt
generation, and user-readable load/inference errors. It uses no network call
for inference. For the critical offline check, install the development build,
copy the model to the device before disconnecting it, then turn off Wi-Fi and
mobile data, stop FastAPI and Ollama, load the model, and generate a response.

Backend Ollama remains a development/runtime fallback from Phase 3. The mobile
local inference path is the target architecture for the actual Git Out
experience; these paths are intentionally separate. This environment has no
Android SDK, emulator, or device, so real Android offline verification is
still pending.

### Mobile Local STT

The Phase 5 speech path is independent of FastAPI, Ollama, cloud speech
services, and bundled speech model weights:

```text
Microphone
    ↓
Android SpeechRecognizer
    ↓
Native Android on-device speech service
```

The app uses the maintained
[`expo-speech-recognition`](https://github.com/jamsch/expo-speech-recognition)
integration. Git Out requests `requiresOnDeviceRecognition: true`, which uses
Android's explicit on-device recognizer on Android 13+ in this implementation.
It deliberately does not rely on `EXTRA_PREFER_OFFLINE`: Android documents that
hint as optional and allows recognizers to ignore it. If explicit on-device
recognition is unavailable, the requested language model is not installed, or
microphone permission is denied, Git Out stops before starting recognition and
shows an actionable error. It never silently falls back to a network recognizer.

The screen lets the user enter a BCP-47 language tag, defaulting to `en-US`.
Before each recording, the app checks the device's installed on-device locale
list and starts only with a matching language. A successful transcript replaces
the current prompt text; manual prompt entry remains available. Text-to-speech
and continuous listening are outside this phase.

On-device availability depends on the Android version, recognition service, and
downloaded system language packs:

- Android 13/API 33 or newer is required by this app's explicit on-device path.
- The device must report on-device recognition support and have the requested
  language installed for offline use.
- If the language is missing, install it from the device's on-device speech
  recognition settings (often under **Settings → Security and privacy → More
  privacy settings → Android System Intelligence → On-device speech
  recognition**) and retry.
- Recognition speed and accuracy depend on the system service, device, and
  language pack. No model is stored in the Git Out app or repository.

Build the native development app after installing the dependencies and
regenerating native code:

```bash
cd frontend
npm install
npx expo prebuild --platform android
npm run android
```

The critical offline STT check is: install the development build, ensure the
requested system language pack is installed, turn off Wi-Fi and mobile data,
stop FastAPI and Ollama, enter the installed language tag, record a short
sentence, and confirm the transcript appears in the prompt input. Also verify
that the app gives a clear unavailable-language/device message when the offline
pack is absent. This repository's development environment has no connected
Android device, so actual offline recognition remains pending until that phone
test is performed.
