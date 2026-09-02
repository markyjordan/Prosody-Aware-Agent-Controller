# Prosody API

FastAPI backend for the prosody comparison client. It owns the half-duplex
audio session, ElevenLabs ASR/TTS providers, prosody inference, parallel OpenAI
policy branches, compatibility HTTP routes, and latency profiling.

## Architecture

`prosody_api.app.create_app(...)` is the composition root. It builds isolated
application instances from immutable `Settings` and a `DependencyContainer`.
The module-level `prosody_api.app:app` remains available for Uvicorn.

The container provides infrastructure and provider ports for clocks, request
IDs, background tasks, ASR, LLM streaming, TTS, prosody prediction, profiling,
and artifact discovery. Credential-free fallbacks remain available. Tests
inject fakes through the same ports and never contact provider networks.

Transport responsibilities stay at the router boundary:

- `routers/audio.py` owns `/ws`, validates sequenced turns, fans audio to ASR
  and prosody work, joins the results, and streams both policy branches.

- `routers/controller.py` serializes structured condition events as SSE.
- `services/condition_service.py` selects prompts and orchestrates LLM tokens.
- `routers/tts.py` streams audio responses and preserves cache headers.
- `services/tts_service.py` separates the ElevenLabs provider, file cache, and
  streaming synthesis. The WebSocket path never pre-generates both branches.
- `services/latency.py` emits content-free turn and TTS records as JSONL.
- `core/artifacts.py` owns configured-probe and research-probe precedence.
- `core/lifespan.py` creates the cache root and records artifact state.

The browser sends PCM16 mono audio at 16 kHz through one persistent WebSocket.
Mic release manually commits Scribe v2 Realtime. ASR completion and prosody
finalization form a join barrier before the baseline and prosodic OpenAI
Responses streams start concurrently.

## Local server

Install the locked environment and launch the retained module-level app:

```sh
cd api
uv sync --locked
uv run uvicorn prosody_api.app:app --reload
```

Configuration can be supplied through the process environment, `api/.env`,
root `.env.local`, root `.env`, or `api/.env.local`. Existing process values
take precedence, followed by those files in the listed order.

Important variables include:

- `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5.6-luna`),
  `OPENAI_REASONING_EFFORT` (default `none`), and
  `OPENAI_MAX_OUTPUT_TOKENS`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL_ID`
- `ELEVENLABS_ASR_MODEL` (default `scribe_v2_realtime`)
- `PROBE_PATH` and `TTS_CACHE_DIR`
- `LATENCY_PROFILE_PATH` and `PROSODY_TIMEOUT_SECONDS`
- `AUTH_ENABLED`, `AUTH_API_KEY`, and `API_KEY`
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT`, and `RATE_WINDOW`

Without an OpenAI key, condition requests stream deterministic mock tokens.
Prosody prediction uses fixed heuristic features until a real artifact is
wired. An uncached TTS request requires an ElevenLabs key.

## Verification

From the repository root, either command runs the authoritative locked suite:

```sh
./scripts/ci/test-api.sh
just ci
```

The runner resolves the repository from its own location, so it works from any
current directory. It blanks provider and auth credentials before pytest,
requires at least 90% line coverage over the active HTTP core, and propagates
any test or coverage failure.

Coverage omits only the unused legacy utterance aggregator.

Characterization and seam tests live in `api/tests/`. They cover the public
routes, middleware, aliases, defaults, fallbacks, SSE ordering, injected ports,
cache behavior, cancellation, and failure boundaries without credentials or
network access.

## Latency profiles

The backend appends privacy-safe turn and TTS records to
`api/.cache/latency/turns.jsonl` by default. Records contain identifiers,
provider/model names, outcomes, and monotonic durations, but never audio,
transcripts, prompts, or generated responses.
Set `LATENCY_PROFILE_PATH=off` to disable persistence while retaining the
per-turn profile sent to the browser.

Summarize the capture with:

```sh
just profile-latency
```

The report separates cold and warm turns and prints p50, p95, maximum, failure
rate, provider/model groupings, and compliance with the 1.5-second warm
release-to-first-text target.
