# Prosody Aware Agent Controller

## Hypothesis

```text
user_response(text, prosody) > user_response(text)
```

A realtime A/B demo: the same utterance drives two agent responses side by side —
one conditioned on the ASR transcript alone (`baseline`), one also conditioned on
prosodic features extracted from your voice (`prosodic`).

## Quickstart

```sh
mise install        # pins node per mise.toml
npm install
npm run dev         # starts vite + mock WS server (port 8787)
```

Open http://localhost:5173, pick a scenario in the header, then press **▶
simulate** — it streams a synthetic utterance over the WebSocket (same protocol
path as live audio: `utterance.begin` → `audio.delta` → `utterance.end`) and the
mock replays its canned A/B response. No microphone required.

Mic capture is disabled by default while the backend is mocked. To speak for
real:

```sh
VITE_MIC=1 npm run dev
```

Then hold the mic button / Space and talk (hold-to-talk default; click the
`hold` chip to switch to toggle mode). Because simulate and mic drive the
identical wire contract, swapping the mock for your real backend changes nothing
client-side.

## Architecture

| Piece | Where | Notes |
|---|---|---|
| Wire contract | `src/protocol.ts` | zod schemas; server frames are validated at runtime |
| Socket controller | `src/session/session.ts` | reconnect/backoff, dispatch into store |
| Store | `src/state/store.ts` | turns, branch streams, statuses |
| Audio capture | `src/hooks/useRecorder.ts` + `public/recorder-worklet.js` | AudioWorklet → PCM16 mono @16 kHz, ~100 ms chunks |
| Mock backend | `mock/server.mjs`, `mock/scenarios.mjs` | executable spec; canned A/B scenarios |

Every turn has a client-generated `turnId`. The backend streams ASR partials,
the final model-neutral prosody result, both policy branches, and a privacy-safe
latency profile over the same WebSocket. The UI shows release-to-first-text,
ASR commit, and completion timings below each finished trial.

TTS remains user-selected. Each branch play control requests ElevenLabs Flash
v2.5 through `/api/tts`; supported browsers append the MP3 response to a
`MediaSource` for early playback and other browsers retain buffered playback.

The frontend is deliberately a dumb pipe + renderer: ASR, prosody extraction,
parallel A/B LLM inference, histories, and provider credentials all belong to
the backend. Point it at a real backend with
`VITE_WS_URL=ws://host:port npm run dev` (or `NO_MOCK=1` to skip spawning the
mock alongside vite).

## Scripts

```sh
just dev          # same as npm run dev
just check        # typecheck + production build
node mock/server.mjs   # standalone mock backend
```
