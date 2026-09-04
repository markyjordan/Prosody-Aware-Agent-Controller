# Prosody Aware Agent Controller

## Hypothesis

```text
user_response(text, prosody) > user_response(text)
```

A realtime A/B demo: the same utterance drives two agent responses side by side —
one conditioned on the ASR transcript alone (`baseline`), one also conditioned on
prosodic features extracted from your voice (`prosodic`).

## Quickstart

Start FastAPI in a separate terminal using the [backend setup](../../api/README.md).
The default local API address is `http://localhost:8000`.

From `apps/web`:

```sh
mise install        # pins node per mise.toml
npm install
npm run dev         # starts Vite; /ws and /api proxy to FastAPI on :8000
```

Open http://localhost:5173. The chat displays an opening coding-agent message
before you record. Hold the mic button or Space to speak, then release to submit
that trial. Click the `hold` chip to switch to toggle mode: click the mic or
press Space once to start and again to stop. Keyboard shortcuts leave editable
fields and other controls alone; a focused mic button also supports keyboard
activation.

Microphone access is requested on first activation and requires HTTPS or
localhost. PTT stays disabled until the backend acknowledges the audio session.
The waveform displays live microphone amplitude while recording and a flat
line while idle. Releasing during startup cancels capture; blur, cancellation,
and disconnect also stop capture. Recording and response playback are
half-duplex: a new recording waits for processing and TTS to finish.

### Per-trial openers

Each trial starts with a hardcoded coding-agent question or comment. The
opener shown before recording stays attached to that trial. Completion or a
terminal trial error selects the next opener independently from the entire
set, so consecutive trials can have the same opener. Rerenders and reconnects
do not change existing selections. A microphone startup failure keeps the
pending opener because no trial was created.

Clear removes displayed trials and independently selects an opener, including
when there are no recorded trials. It is disabled during startup, recording,
processing, and TTS.

Openers are display-only: they are never sent to the backend or included in
its conversation history. The backend therefore does not know what opener a
spoken reply refers to. Clear resets the frontend display only; it does not
reset the backend conversation history.

### Explicit mock development

```sh
USE_MOCK=1 npm run dev
```

This starts the mock server on port `8787` and routes `/ws` and `/api` to it.
The microphone and waveform still use real browser audio, but transcription
and A/B responses are canned. The old simulation controls remain commented
out in the app and their implementations are retained.

Connection overrides:

| Variable | Behavior |
|---|---|
| `API_PORT` | FastAPI proxy port; defaults to `8000` |
| `VITE_WS_URL` | Explicit browser WebSocket URL, including `/ws` |
| `USE_MOCK=1` | Opt into mock startup and mock `/ws` and `/api` routing |
| `MOCK_PORT` | Mock server/proxy port; defaults to `8787` |
| `NO_MOCK=1` | Suppress automatic mock startup; does not change routing |
| `TTS_PORT` | TTS proxy port; defaults to `API_PORT`, including in mock mode |

For example, `USE_MOCK=1 NO_MOCK=1 npm run dev` connects to an independently
started mock server. `VITE_WS_URL=ws://host:8000/ws npm run dev` overrides only
the socket destination; configure the API/TTS proxy separately if needed.
Microphone input no longer requires `VITE_MIC=1`.

## Architecture

| Piece | Where | Notes |
|---|---|---|
| Wire contract | `src/protocol.ts` | zod schemas; server frames are validated at runtime |
| Socket controller | `src/session/session.ts` | reconnect/backoff, dispatch into store |
| Store | `src/state/store.ts` | turns, branch streams, statuses |
| Audio capture | `src/hooks/useRecorder.ts` + `public/recorder-worklet.js` | AudioWorklet → PCM16 mono @16 kHz, ~100 ms chunks; stop acknowledgement flushes final frames |
| Waveform | `src/components/RealtimeWaveform.tsx` | Shared recorder analyser and themed canvas rendering |
| Trial openers | `src/state/openers.ts` + `src/state/store.ts` | Independent display-only selection, captured on each trial |
| Mock backend | `mock/server.mjs`, `mock/scenarios.mjs` | executable spec; canned A/B scenarios |

Every turn has a client-generated `turnId`. The backend streams ASR partials,
the final model-neutral prosody result, both policy branches, and a privacy-safe
latency profile over the same WebSocket. The UI shows release-to-first-text,
ASR commit, and completion timings below each finished trial.

TTS remains user-selected. Each branch play control requests ElevenLabs Flash
v2.5 through `/api/tts`; supported browsers append the MP3 response to a
`MediaSource` for early playback and other browsers retain buffered playback.

ASR, prosody extraction, parallel A/B inference, backend conversation histories,
and provider credentials remain backend responsibilities. The frontend owns
microphone capture, display-only openers, and rendering session events.

## Verification

From `apps/web`:

```sh
npm run typecheck
npm run build
npm test             # Vitest/jsdom lifecycle, protocol, opener, and waveform tests
npm run test:smoke   # mock WebSocket and compatibility HTTP contract checks
```

The regression tests use controlled media, session, and randomness inputs;
they do not require a microphone or provider credentials. Live ASR, prosody,
and response verification additionally requires the running backend and its
configured providers. Browser verification should cover microphone permission,
hold/toggle controls, final audio delivery, waveform activity, both themes,
and narrow layouts.

## Scripts

```sh
just dev              # same as npm run dev
just check            # TypeScript check and production build
node mock/server.mjs  # standalone mock backend
```
