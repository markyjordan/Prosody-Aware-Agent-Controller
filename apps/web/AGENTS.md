# AGENTS.md

Frontend for the Prosody-Aware Agent Controller demo. The interesting logic
(ASR, prosody model, LLM conditioning) lives in the backend; this app is a
dumb pipe + renderer over a single WebSocket contract represented by zod types
in src/protocol.ts. Coding-agent openers are frontend-only display context;
they are never sent to the backend.

Commands:
- dev: `npm run dev` (proxies /ws and /api to FastAPI on :8000; API_PORT overrides)
- mock dev: `USE_MOCK=1 npm run dev` (spawns mock on :8787; MOCK_PORT overrides;
  NO_MOCK=1 suppresses startup without changing routing)
- audio: PTT is available by default, gated by session.ready and half-duplex
  activity; no VITE_MIC gate.
  VITE_WS_URL overrides the socket URL; TTS_PORT overrides the API TTS proxy.
- typecheck: `npm run typecheck`
- build: `npm run build`
- test: `npm test` (Vitest/jsdom; credential-free media/session doubles)
- smoke: `npm run test:smoke` (standalone mock contract check)

Conventions:
- Styling: StyleX only (`stylex.create` + tokens from src/styles/tokens.stylex.ts).
  No CSS frameworks. Theme vars live in *.stylex.ts files (defineVars).
- State: zustand store in src/state/store.ts; socket events flow through
  src/session/session.ts, never mutate React state directly.
- Protocol changes go to src/protocol.ts first, then mock/server.mjs as the
  executable reference.
- Node version pinned via mise.toml. Python research env lives separately
  in research/ (conda), do not mix toolchains.

Trial opener conventions:
- Sample independently from the full hardcoded set; repeats are valid.
- Display the pending opener before recording and snapshot it on the trial.
- Select again after completion, terminal trial failure, or Clear. Startup
  failures without a trial, rerenders, and reconnects preserve the selection.
- Clear affects frontend history only and is blocked during voice activity.
