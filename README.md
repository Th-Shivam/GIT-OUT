# Git Out

Git Out is a voice-first AI companion that helps developers discuss GitHub
work, review code, and practice technical conversations while walking.

## Current architecture

- `frontend/` — React Native + Expo + TypeScript mobile client with an
  Android-first local LLM, native speech input, and native speech output.
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

Native Android STT → editable prompt → manual Generate → local Qwen/llama.rn
    → final text answer → Android TextToSpeech → installed non-network voice
```

The initial foundation uses REST between the mobile client and API. GitHub
calls follow route → service → async HTTP client → GitHub API, without storing
GitHub data in MongoDB. Authentication, realtime voice, and AI model
integrations will be added in later phases. The mobile speech path uses
Android's native on-device recognizer and TextToSpeech engine, with local Qwen
inference through `llama.rn`.

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

Use a native development build for the local AI screen and Android speech;
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
the current prompt text; manual prompt entry remains available. Phase 6 adds
optional speech output after manual submission, described below.

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

### Native Android TTS & voice conversation (Phase 6)

**Record prompt → Stop and transcribe → review/edit prompt → Generate → listen.**
The **Speak response** switch is off by default. When enabled, only the completed
Qwen answer is spoken; the full answer stays visible. **Speak answer again / retry**
also lets you explicitly replay a visible answer, even with auto-speech off.
**Stop speaking** cancels playback and any pending automatic speech for the
current generation. It does not cancel Qwen's computation or erase its answer.

#### Native implementation and voice availability

`frontend/modules/git-out-tts/` is a small Android-only local Expo module wrapping
`android.speech.tts.TextToSpeech`. Expo autolinks it from `frontend/modules/` in
development builds. It uses the existing Expo Modules API/New Architecture; no
new npm runtime dependency or speech-model package is needed. No Whisper,
Piper, Coqui, or separate TTS model is bundled or downloaded by Git Out.

- Initialization waits for Android `OnInit`, with a 10-second timeout and
  actionable failure messages. An explicit retry can initialize again after failure.
- **Check TTS voice** queries the engine's voice list. TTS has its own BCP-47
  language setting, independent of STT; both default to `en-US`. TTS requires an
  exact locale match (for example, `en-GB` is not silently replaced by `en-US`).
- Only voices reporting `isNetworkConnectionRequired == false` and not marked
  `KEY_FEATURE_NOT_INSTALLED` are eligible. The native bridge rechecks the voice
  and `isLanguageAvailable` immediately before speaking, checks `setVoice`, and
  never substitutes a default/network voice. Empty or over-limit text is rejected.
- Voice metadata is supplied by the installed engine; it is not proof of offline
  behavior on every phone. Some engines report incomplete or inaccurate data.
  Missing data and synthesis errors keep the text answer and offer retry.
- TTS in this app requires Android 8/API 26+ for its audio-focus handling. The full
  STT → Qwen → TTS flow still requires Android 13/API 33+ for existing STT checks.
- This feature uses Android's system-selected TTS engine and media audio route.
  Earphones/Bluetooth output and media volume are controlled by Android. No
  speaker route is forced. Speech stops on audio focus loss (including transient
  loss), audio-becoming-noisy events such as headphone removal, and backgrounding.

Voice capabilities are separate: **Local LLM model** shows GGUF load state,
**Offline speech input** checks Android STT availability/language packs, and
**Speak response** shows TTS voice availability and playback/error state.
An STT language pack does not necessarily provide a TTS voice for that language.

#### Cancellation and lifecycle

Native operations run on the main thread. TTS uses stop plus `QUEUE_FLUSH`, and
JavaScript serializes start/stop commands with request revisions and utterance IDs.
Old initialization results or playback callbacks cannot start/update a newer
request. A new generation stops old speech first; rapid duplicate Generate taps
are ignored until the current local inference finishes. Starting the microphone
waits for TTS to stop, to avoid recognizing the app's own answer.

Turning speech off, changing the TTS language, pressing Stop, or backgrounding the
app suppresses pending autoplay. Returning to the app does not resume speech or
the microphone automatically. STT is cancelled on background/unmount (including
permission/support checks that are still pending); its on-device checks remain
in place. TTS releases its engine, focus, listeners, and initialization promises
on shutdown/module destruction. The LLM context is released after any in-flight
generation finishes on unmount.

This is a foreground, manually submitted conversation. Continuous listening,
wake words, automatic reactivation, headset-button control, lock-screen playback,
and a foreground media service are not implemented. Pocket/locked-screen operation
is a next-phase goal; locking the screen currently stops speech. Answers longer
than the engine's `getMaxSpeechInputLength()` limit remain text-only with a clear
error; there is no token streaming or speech chunk queue.

#### Setup and troubleshooting

Install a new native development build (Expo Go and an older Phase 5 binary do
not contain `GitOutTts`). With dependencies installed, build using
`npm run android` from `frontend/` on a machine with a JDK and Android SDK. The
module manifest supplies the Android 11+ `android.intent.action.TTS_SERVICE`
package-visibility query. Hand-written module sources are tracked separately
from the generated `frontend/android/` project. No clean/reset is needed.

If no suitable voice is available, open Android **Settings → Text-to-speech
output** (location varies by manufacturer), enable/update the preferred engine,
and use its **Install voice data** settings to install the requested language.
This user-directed setup may need internet. Return to Git Out, use **Check TTS
voice**, and retry. A network-only voice is intentionally rejected. For silence,
check media volume, earphone routing, and whether another app owns audio focus.
Initialization failure, missing module, unsupported language, and synthesis
failure appear under TTS while the generated text remains readable.

#### Physical-device/offline verification — pending

Unit tests mock the engine; they do not verify Android initialization, real voice
data, earphone behavior, or offline speech. Perform these checks on the phone:

1. Build/install the new development app; load the existing Qwen GGUF.
2. Generate with **Speak response** off; confirm text-only inference still works.
3. Check an installed TTS language, enable speech, and generate another answer.
4. Stop midway, replay, and quickly start another request. Confirm no overlapping
   or delayed stale speech. Start STT during playback and confirm output stops.
5. Try a missing language/voice; confirm an actionable TTS error and retained text.
6. Test earphones, disconnect them during speech, and background/return to the app.
   Speech/input should stop with no automatic restart.
7. Disable **both Wi-Fi and mobile data**, stop FastAPI/Ollama, and repeat STT,
   local inference, TTS, stopping, and missing-language tests. Record phone model,
   Android version, TTS engine/version, language/voice ID, and results.
8. Verify that missing offline data yields an error, not a network fallback. For
   additional evidence, inspect traffic from both the app and the installed
   system speech engine while repeating the tests.

Use a development build with Metro already reachable over USB (`adb reverse`) or
a locally bundled release build when testing without wireless networking; Metro
connectivity is distinct from inference/speech connectivity. GitHub fetching and
initial dependency/model/system-voice downloads require internet. The mobile
conversation path calls neither FastAPI/Ollama nor cloud speech APIs. Actual
offline operation remains **unverified on a physical Android device**.
