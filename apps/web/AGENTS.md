# AGENTS.md

Frontend for the Prosody-Aware Agent Controller demo. The interesting logic
(ASR, prosody model, LLM conditioning) lives in the backend; this app is a
dumb pipe + renderer over a single WebSocket contract represented by zod types
in src/protocol.ts.

Commands:
- dev: `npm run dev` (spawns mock WS server on :8787 automatically; NO_MOCK=1 to disable)
- typecheck: `npm run typecheck`
- build: `npm run build`

Conventions:
- Styling: StyleX only (`stylex.create` + tokens from src/styles/tokens.stylex.ts).
  No CSS frameworks. Theme vars live in *.stylex.ts files (defineVars).
- State: zustand store in src/state/store.ts; socket events flow through
  src/session/session.ts, never mutate React state directly.
- Protocol changes go to src/protocol.ts first, then mock/server.mjs as the
  executable reference.
- Node version pinned via mise.toml. Python research env lives separately
  in research/ (conda), do not mix toolchains.
