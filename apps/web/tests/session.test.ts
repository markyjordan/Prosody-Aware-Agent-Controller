import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SessionController } from "../src/session/session";
import { useSessionStore as store } from "../src/state/store";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static latest: Socket;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen = () => {};
  onclose = () => {};
  onmessage = (_event: { data: string }) => {};
  onerror = () => {};
  constructor(_url: string) { Socket.latest = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose(); }
  open() { this.readyState = 1; this.onopen(); }
  event(data: unknown) { this.onmessage({ data: JSON.stringify(data) }); }
  ready() { this.event({ type: "session.ready", sessionId: "session", protocolVersion: 1 }); }
}
let session: SessionController;
let socket: Socket;
beforeEach(() => {
  vi.stubGlobal("WebSocket", Socket);
  session = new SessionController();
  session.connect("ws://test/ws");
  socket = Socket.latest;
  socket.open();
});
afterEach(() => session.disconnect());

it("requires session.ready and omits both openers and scenarios in real mode", () => {
  expect(session.beginTurn()).toBeNull();
  expect(socket.sent).toEqual([{
    type: "session.init", protocolVersion: 1, sampleRate: 16000, codec: "pcm16",
  }]);
  socket.ready();
  const turnId = session.beginTurn();
  expect(turnId).toBeTruthy();
  session.sendAudio("first");
  session.sendAudio("final");
  session.endTurn();
  expect(socket.sent.slice(1)).toEqual([
    { type: "utterance.begin", turnId },
    { type: "audio.delta", turnId, sequence: 0, data: "first" },
    { type: "audio.delta", turnId, sequence: 1, data: "final" },
    { type: "utterance.end", turnId },
  ]);
});

it("does not start another turn before the completion profile", () => {
  socket.ready();
  const turnId = session.beginTurn()!;
  session.endTurn();
  socket.event({ type: "response.done", turnId, branch: "baseline" });
  socket.event({ type: "response.done", turnId, branch: "prosodic" });
  expect(store.getState().liveTrialId).toBeNull();
  expect(session.beginTurn()).toBeNull();
  socket.event({ type: "turn.profile", turnId, profile: {} });
  expect(store.getState().processing).toBe(false);
  expect(session.beginTurn()).toBeTruthy();
});

it.each([false, true])("cleans up a disconnect during processing=%s", (released) => {
  socket.ready();
  session.beginTurn();
  if (released) session.endTurn();
  socket.close();
  expect(store.getState()).toMatchObject({ sessionId: null, processing: false, liveTrialId: null, recording: false });
  expect(store.getState().trials[0].status).toBe("error");
});

it("invalidates a rejected turn so a later turn can begin", () => {
  socket.ready();
  const turnId = session.beginTurn();
  socket.event({ type: "error", turnId, code: "invalid_audio", message: "invalid audio" });
  expect(store.getState().trials[0].status).toBe("error");
  expect(session.beginTurn()).toBeTruthy();
});

it("ignores stale socket callbacks after reconnect and preserves the opener", () => {
  const opener = store.getState().pendingOpener;
  session.disconnect();
  session.connect("ws://test/ws");
  socket.ready();
  socket.close();
  expect(store.getState().sessionId).toBeNull();
  expect(store.getState().conn).toBe("connecting");
  expect(store.getState().pendingOpener).toBe(opener);
});
