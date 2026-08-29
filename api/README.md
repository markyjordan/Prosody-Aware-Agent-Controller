# Prosody API

FastAPI backend for the prosody comparison client. It exposes health, condition
streaming, text-to-speech, and prosody-debug routes while the real-time audio
pipeline remains deferred.

## Architecture

`prosody_api.app.create_app(...)` is the composition root. It builds isolated
application instances from immutable `Settings` and a `DependencyContainer`.
The module-level `prosody_api.app:app` remains available for Uvicorn.

The container provides infrastructure and provider ports for clocks, request
IDs, background tasks, LLM streaming, TTS, prosody prediction, and artifact
discovery. Production defaults retain credential-free LLM and prosody
fallbacks. Tests inject fakes through the same ports and never contact provider
networks.

HTTP responsibilities stay at the router boundary:

- `routers/controller.py` serializes structured condition events as SSE.
- `services/condition_service.py` selects prompts and orchestrates LLM tokens.
- `routers/tts.py` streams audio responses and preserves cache headers.
- `services/tts_service.py` separates the ElevenLabs provider, file cache,
  streaming synthesis, and background prefetch.
- `core/artifacts.py` owns configured-probe and research-probe precedence.
- `core/lifespan.py` creates the cache root and records artifact state.

The audio WebSocket router and the ASR, audio-ingress, and utterance-aggregator
services are scaffolds. The WebSocket is intentionally not mounted.

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

- `OPENAI_API_KEY` and `OPENAI_MODEL`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and `ELEVENLABS_MODEL_ID`
- `PROBE_PATH` and `TTS_CACHE_DIR`
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

Coverage omits only the deferred modules:

- `routers/audio.py`
- `services/asr_service.py`
- `services/audio_ingress.py`
- `services/aggregator.py`

Characterization and seam tests live in `api/tests/`. They cover the public
routes, middleware, aliases, defaults, fallbacks, SSE ordering, injected ports,
cache behavior, cancellation, and failure boundaries without credentials or
network access.
