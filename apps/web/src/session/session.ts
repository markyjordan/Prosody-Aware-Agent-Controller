import {
  serverEventSchema,
  type ClientEvent,
  type ServerEvent,
} from "../protocol";
import { useSessionStore } from "../state/store";
import { dispatchTurn } from "./fanout";

const MAX_BACKOFF_MS = 5000;
const OUTBOX_CAP = 400;

function dispatch(evt: ServerEvent) {
  const s = useSessionStore.getState();
  switch (evt.type) {
    case "asr.partial":
      s.beginTrial();
      useSessionStore.getState().applyPartial(evt.text);
      break;
    case "prosody.update":
      s.beginTrial();
      useSessionStore.getState().applyProsody(evt.prosody);
      break;
    case "asr.final":
      useSessionStore.getState().finalize(evt.text, evt.prosody);
      void dispatchTurn(evt.text, evt.prosody);
      break;
    case "response.delta":
      useSessionStore.getState().appendDelta(evt.branch, evt.text);
      break;
    case "response.done":
      useSessionStore.getState().completeBranch(evt.branch);
      break;
    case "error":
      useSessionStore.getState().failActive(evt.message);
      break;
  }
}

class SessionController {
  private ws: WebSocket | null = null;
  private gen = 0;
  private desired = false;
  private attempt = 0;
  private url = "";
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private outbox: ClientEvent[] = [];

  connect(url: string) {
    this.url = url;
    this.desired = true;
    this.open();
  }

  disconnect() {
    this.desired = false;
    this.clearRetry();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    useSessionStore.getState().setConn("disconnected");
  }

  reinit() {
    this.send({
      type: "session.init",
      sampleRate: 16000,
      codec: "pcm16",
      scenario: useSessionStore.getState().scenario,
    });
  }

  send(evt: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.transmit(evt);
      return;
    }
    if (!this.desired) return;
    if (
      evt.type === "audio.delta" &&
      this.outbox.length >= OUTBOX_CAP
    ) {
      const idx = this.outbox.findIndex((e) => e.type === "audio.delta");
      if (idx >= 0) this.outbox.splice(idx, 1);
    }
    if (this.outbox.length < OUTBOX_CAP) this.outbox.push(evt);
  }

  private transmit(evt: ClientEvent) {
    this.ws?.send(JSON.stringify(evt));
  }

  private flushOutbox() {
    const queued = this.outbox;
    this.outbox = [];
    for (const evt of queued) this.transmit(evt);
  }

  private clearRetry() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private open() {
    if (!this.desired) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.clearRetry();
    const gen = ++this.gen;
    useSessionStore.getState().setConn("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.gen || !this.desired) {
        ws.close();
        return;
      }
      this.attempt = 0;
      useSessionStore.getState().setConn("connected");
      this.reinit();
      this.flushOutbox();
    };

    ws.onmessage = (e) => {
      if (gen !== this.gen) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data as string);
      } catch {
        return;
      }
      const result = serverEventSchema.safeParse(parsed);
      if (!result.success) {
        console.warn("dropping malformed server event", result.error.issues);
        return;
      }
      dispatch(result.data);
    };

    ws.onclose = () => {
      if (gen !== this.gen) return;
      this.ws = null;
      useSessionStore.getState().setConn("disconnected");
      if (this.desired) {
        this.attempt += 1;
        const delay = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.open();
        }, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  return proto + location.host + "/ws";
}

export const session = new SessionController();
