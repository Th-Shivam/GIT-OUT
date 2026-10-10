# Git Out

Git Out is a local-first voice companion for developers. It helps you think
through Git workflows, code-review concepts, and implementation plans while
you are away from a desk. The core conversation stays on the Android device:
native on-device speech recognition feeds a local Qwen model, and an installed
Android voice can read the completed answer aloud.

## Problem and product direction

Developer tools often require a screen, a network connection, and several
context switches. Git Out provides a focused walking workflow:

1. Speak one question.
2. Review the final on-device transcript.
3. Generate with the local Qwen GGUF model.
4. Read the answer or listen through an installed Android TTS voice.

GitHub context is an optional, separate connected workspace. It is never
required for local conversation and its server-side token is never shipped to
the mobile app.

## Features

### Local conversation

- Android-first `llama.rn` inference with
  `Qwen2.5-1.5B-Instruct Q4_K_M GGUF`.
- Manual text prompts remain available when speech is unavailable.
- Prompt shortcuts for pull requests, refactors, and Git workflows.
- Readable response history with copy and native TTS replay actions.
- Text answers remain visible when voice synthesis fails.

### Pocket Mode

- Large, high-contrast controls for walking use.
- Explicit `Ready`, `Listening`, `Transcribing`, `Thinking`, `Speaking`, and
  `Error` states.
- One-shot voice turns: one recording produces one transcript and one local
  generation request.
- Stop/cancel and exit controls invalidate stale recognition callbacks and
  pending automatic speech.
- No wake word, continuous microphone session, or automatic microphone restart.

### Native Android voice path

- `expo-speech-recognition` with explicit on-device recognition checks.
- Installed STT language verification before the microphone opens.
- Small local Expo module around Android `TextToSpeech`.
- Exact installed, non-network TTS voice matching; no silent locale fallback.
- Android audio focus and headphone-disconnect handling.
- Framework `MediaSession` controls for supported headset, lock-screen, and
  notification surfaces.
- A minimal `mediaPlayback` foreground service is used only while an already-
  started answer is being spoken. It never starts the microphone.
- Backgrounding preserves an utterance that has already started while
  suppressing new background autoplay and recognition.

### GitHub workspace

The GitHub tab is read-only and uses the existing FastAPI service:

- authenticated account status;
- recently updated repositories;
- assigned open issues;
- open pull requests and recent commits per repository.

The backend validates and whitelists response fields before returning them to
the mobile client. GitHub data is not used as a hidden fallback for local AI.

## UI overview

The mobile app uses a dark, developer-focused surface system inspired by code
hosting tools without copying their branding or screens:

- **Home** — quick Pocket Mode access, model readiness, the local loop, and the
  latest answer;
- **Chat** — text generation, developer prompt shortcuts, response history,
  copy, and replay;
- **GitHub** — connected-account status and repository context;
- **Settings** — GGUF loading, STT language packs, TTS voice checks, privacy,
  and connectivity guidance.

The UI uses reusable surface, button, status-pill, field, empty-state, and tab
components. Touch targets are intentionally large, disabled states are
visible, and the microphone is never represented as silently available in the
background.

## Architecture

```text
Android native development build
        │
        ├── Pocket Mode / Chat / Settings UI
        │       │
        │       ├── expo-speech-recognition
        │       │       └── local transcript → LocalAI → final answer
        │       │                                  │
        │       │                                  └── GitOutTts Expo module
        │       │                                      ├── TextToSpeech
        │       │                                      ├── AudioFocus
        │       │                                      ├── MediaSession
        │       │                                      └── scoped mediaPlayback service
        │       │
        │       └── optional fetch → FastAPI → GitHub REST API
        │
        └── llama.rn → local Qwen GGUF
```

The backend also retains its independent local Ollama development endpoint at
`POST /ai/chat`. The mobile local inference path does not call that endpoint.

### Repository layout

```text
frontend/
  App.tsx                         app orchestration and navigation
  src/ui/                         reusable dark design system
  src/home/                       Home surface
  src/chat/                       local conversation surface
  src/github/                     GitHub client and browse surface
  src/settings/                   device/model settings surface
  src/pocket-mode/                one-shot voice UI and media action policy
  src/local-ai/                   llama.rn and model storage abstraction
  src/local-stt/                  native on-device STT abstraction
  src/local-tts/                  serialized TTS controller and adapter
  modules/git-out-tts/            handwritten native Android Expo module
backend/
  app/github/                     authenticated GitHub REST client/service
  app/api/routes/github.py        safe GitHub read endpoints
  app/ai/                         independent local Ollama endpoint
```

## Technology and prerequisites

### Required for the mobile development build

- Node.js and npm;
- JDK 17;
- Android SDK Platform 36;
- Android Build Tools 36.0.0;
- Android NDK `27.1.12297006`;
- Gradle wrapper supplied by `frontend/android`;
- Android 13/API 33 or newer for Git Out's explicit on-device STT path;
- Android 8/API 26 or newer for the native TTS audio-focus path;
- an Android phone or emulator with an available local model memory budget.

The native app is configured for `arm64-v8a` and `x86_64`. A physical phone is
recommended because speech services, TTS voice packs, headset buttons, and
lock-screen behavior vary by manufacturer.

### Backend development

- Python 3.11 or newer;
- a virtual environment;
- MongoDB if database-backed health status is needed;
- a GitHub token only if the GitHub tab is used;
- Ollama only if the independent backend `/ai/chat` route is used.

## Setup

### 1. Install project dependencies

```bash
git clone <repository-url>
cd Git-out
cd frontend
npm install
```

The tracked local Expo module is autolinked from `frontend/modules/`. No
Whisper, Piper, Coqui, cloud speech SDK, or separate speech-model package is
installed.

### 2. Configure the backend (optional for local conversation)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

Set `GITHUB_TOKEN` in `backend/.env` for the GitHub tab. Keep it empty if that
feature is not needed. The token is read only by FastAPI and is never placed in
`frontend/.env` or bundled into the app.

Relevant backend variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | health/database connection | `mongodb://localhost:27017` |
| `MONGODB_DATABASE` | database name | `git_out` |
| `GITHUB_TOKEN` | server-only GitHub credential | empty |
| `GITHUB_API_BASE_URL` | GitHub API endpoint | `https://api.github.com` |
| `GITHUB_TIMEOUT_SECONDS` | GitHub request timeout | `10` |
| `OLLAMA_BASE_URL` | independent backend AI runtime | `http://localhost:11434` |
| `OLLAMA_MODEL` | independent backend model | `qwen3:4b` |

Start the service with:

```bash
uvicorn app.main:app --reload
```

### 3. Configure the mobile API URL (optional)

```bash
cd frontend
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to a URL reachable by the Android device. On a real
phone, `http://localhost:8000` refers to the phone, not the development
computer; use the computer's LAN address or `adb reverse` for a development
build. This URL is used for GitHub browsing only.

### 4. Acquire and load the local model

Download the `Qwen2.5-1.5B-Instruct Q4_K_M GGUF` file from the official Qwen
GGUF repository. Git Out does not bundle or automatically download weights.

1. Put the `.gguf` file in the Android device's `Download` folder.
2. Open **Settings** in Git Out.
3. Choose **Choose GGUF**.
4. Load the model and wait for the device-local load to finish.

Model files and `*.gguf` files are ignored by Git. Plan for roughly 2 GiB or
more of free app memory; actual usage depends on the phone and context size.

## Build and run Android

Generate/update the native project without cleaning user files:

```bash
cd frontend
npx expo prebuild --platform android
npm run android
```

The generated `frontend/android/` project is ignored. Do not use
`expo prebuild --clean` for this project because it can remove local native
work. For a direct debug APK build:

```bash
cd frontend/android
./gradlew :app:assembleDebug --console=plain --max-workers=2
```

Install the resulting debug APK with Android Studio or:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The final device build must include the handwritten `GitOutTts` module. Expo
Go and an older development binary do not contain it.

## Native speech limitations and permissions

### Speech input

Git Out requests Android's explicit on-device recognizer and checks the
installed locale list before recording. It does not use
`EXTRA_PREFER_OFFLINE`, because that hint can be ignored by a recognizer.

- Android 13/API 33+ is required by the selected native support query.
- The requested BCP-47 language pack must be installed in Android's on-device
  speech settings.
- Microphone permission is requested by the speech-recognition config.
- Permission denial, missing packs, unsupported devices, and cancellation are
  shown as actionable errors.
- A background transition cancels a pending or active recognition session.

### Speech output

The local module uses Android's installed `TextToSpeech` engine:

- Android 8/API 26+ is required for the configured audio-focus path;
- the selected TTS locale must exactly match an installed non-network voice;
- missing voice data, network-only voices, and text over the Android input limit
  are rejected without erasing the answer;
- audio focus loss, transient interruptions, and headphone removal stop speech;
- a media session and notification exist only around active Pocket playback;
- denying notification permission may remove notification controls, while the
  text answer remains available;
- an utterance already started may finish after the app is backgrounded;
  returning to the app does not restart it;
- no automatic microphone activation occurs from the background.

Headset behavior is device and manufacturer dependent. Git Out handles standard
Android media-session events and keeps large in-app controls as the reliable
fallback. It does not claim universal Bluetooth-button behavior.

## Offline and connected behavior

| Capability | Network required during use? | Notes |
| --- | --- | --- |
| Local Qwen conversation | No | Model must already be stored and loaded |
| Android on-device STT | No | Installed system language pack required |
| Android installed TTS | No for eligible voice | Voice data must already be installed |
| GitHub tab | Yes | FastAPI and GitHub API/token are required |
| Backend `/ai/chat` | Depends on local Ollama setup | Separate development path, not mobile inference |
| Initial npm/model/voice downloads | Usually yes | Setup-time operations only |

## Verification commands

Run checks from `frontend/`:

```bash
npm run typecheck
npm test
npx expo config --type public
npx expo export --platform android
```

Run backend checks from `backend/`:

```bash
python -m compileall -q app tests
pytest
```

Also check the exact changes before committing:

```bash
git diff --check
git status --short
```

The automated frontend tests cover local AI guards, STT language/prompt
behavior, TTS voice selection and cancellation, voice-conversation lifecycle,
Pocket state transitions, and duplicate media-command gating. They do not
replace a real Android build or phone test.

## Physical-device acceptance checklist

1. Build a fresh native development APK containing `GitOutTts`.
2. Install a Qwen GGUF and load it with Wi-Fi and mobile data disabled.
3. Generate a text answer with speech disabled.
4. Enable an installed exact-match TTS voice and generate again.
5. Stop midway, replay, and quickly submit another prompt; confirm no stale or
   overlapping speech.
6. Enter Pocket Mode and verify `Ready → Listening → Transcribing → Thinking →
   Speaking` for one voice turn.
7. Tap Stop during recognition, inference, and TTS; confirm the next turn is
   not submitted accidentally.
8. Background and lock the phone after speech starts; confirm the answer can
   finish and the media notification appears when permission allows it.
9. Use play/pause/stop on the notification and a connected headset. Verify the
   in-app fallback on devices that do not deliver the expected events.
10. Remove earphones during speech and confirm audio stops safely.
11. Deny microphone and notification permissions and verify readable errors and
    retained text.
12. Remove the requested STT/TTS language pack and verify Git Out refuses a
    network fallback.
13. Configure the backend token and test GitHub account, repositories, issues,
    pull requests, and commits. Confirm the token never appears in device logs
    or responses.

Record the phone model, Android version, TTS engine/version, installed locale,
and results for the submission notes. Physical-device verification is a
separate step from unit tests and Metro connectivity.

## Troubleshooting

### Native module missing

Build and install a new development binary after native module changes. Expo Go
and an old APK cannot load `GitOutTts`. Confirm the module appears in the
autolinking output and that `frontend/modules/git-out-tts/` is present.

### Gradle cannot find the NDK

Install the exact configured components with Android `sdkmanager`:

```bash
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006"
```

Use JDK 17 and ensure `ANDROID_HOME` points to the writable SDK used by Gradle.

### STT is unavailable

Grant microphone permission, use Android 13 or newer, install the requested
on-device speech language pack, and retry. Git Out intentionally stops instead
of switching to network recognition.

### TTS is unavailable or silent

Open Android **Settings → Text-to-speech output**, enable/update the preferred
engine, install the exact requested language voice, raise media volume, and
retry **Check voice**. Network-required voices are intentionally rejected.

### GitHub tab cannot connect

Start FastAPI, set `GITHUB_TOKEN` only in `backend/.env`, and set
`EXPO_PUBLIC_API_URL` to a device-reachable backend URL. A 401 means the token
is missing or rejected; a 403 usually means permissions or rate limiting; a
503 means the service or upstream is unavailable.

## Submission demonstration script

1. Open Git Out on the Android development build and show the dark Home screen.
2. Open Settings, choose the Qwen GGUF, and load it locally.
3. Open Chat, use **Explain a pull request**, generate, copy, and replay the
   answer.
4. Enter Pocket Mode, tap the large microphone control, ask a Git question,
   and show the transcript and spoken local answer.
5. Lock/background the phone during the answer and show the scoped media
   notification and Stop control.
6. Return to Settings and show the explicit STT/TTS locale and privacy states.
7. If configured, open GitHub and show the connected account, repository, issue,
   pull-request, and commit context.
8. State clearly which checks were automated and which were performed on the
   physical phone.

## Verification status

Source implementation and JavaScript/TypeScript checks are maintained in the
repository's commit history. Android native compilation, native module
autolinking, headset behavior, lock-screen playback, installed speech packs,
and offline phone behavior must be verified on a machine with a writable
Android SDK and a target device. Git Out does not claim those checks passed
until they are run.

## License and safety of local configuration

Keep `frontend/.env`, `backend/.env`, model weights, audio recordings, signing
files, and tokens out of Git. The repository includes `.env.example` templates
with placeholders only. Do not place a GitHub token in frontend code, Expo
public configuration, screenshots, logs, or challenge materials.
