import {
  serverEventSchema,
  type ClientEvent,
  type ServerEvent,
} from "../protocol";
import { useSessionStore } from "../state/store";

const MAX_BACKOFF_MS = 5000;

interface ClientMarks {
  released?: number;
  asrFinal?: number;
  firstDelta?: number;
  done?: number;
}

function dispatch(evt: ServerEvent, marks: Map<string, ClientMarks>) {
  const store = useSessionStore.getState();
  switch (evt.type) {
    case "session.ready":
      store.setSessionId(evt.sessionId);
      break;
    case "asr.partial":
      store.applyPartial(evt.turnId, evt.text);
      break;
    case "prosody.update":
      store.applyProsody(evt.turnId, evt.prosody);
      break;
    case "asr.final": {
      const client = marks.get(evt.turnId) ?? {};
      client.asrFinal = performance.now();
      marks.set(evt.turnId, client);
      store.finalize(evt.turnId, evt.text, evt.prosody);
      break;
    }
    case "response.delta": {
      const client = marks.get(evt.turnId) ?? {};
      client.firstDelta ??= performance.now();
      marks.set(evt.turnId, client);
      store.appendDelta(evt.turnId, evt.branch, evt.text);
      break;
    }
    case "response.done": {
      const client = marks.get(evt.turnId) ?? {};
      client.done = performance.now();
      marks.set(evt.turnId, client);
      store.completeBranch(evt.turnId, evt.branch);
      break;
    }
    case "turn.profile": {
      const client = marks.get(evt.turnId);
      const clientDurations = client?.released
        ? {
            release_to_asr_final_ms: client.asrFinal
              ? client.asrFinal - client.released
              : null,
            release_to_first_text_ms: client.firstDelta
              ? client.firstDelta - client.released
              : null,
            release_to_last_done_ms: client.done
              ? client.done - client.released
              : null,
          }
        : {};
      store.applyProfile(evt.turnId, {
        ...evt.profile,
        client_durations_ms: clientDurations,
      });
      marks.delete(evt.turnId);
      break;
    }
    case "error":
      if (evt.turnId && evt.branch) {
        store.failBranch(evt.turnId, evt.branch, evt.message);
      } else {
        store.failActive(`error: ${evt.message}`);
      }
      break;
  }
}

export class SessionController {
  private ws: WebSocket | null = null;
  private gen = 0;
  private desired = false;
  private attempt = 0;
  private url = "";
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeTurnId: string | null = null;
  private sequence = 0;
  private processingTurnId: string | null = null;
  private marks = new Map<string, ClientMarks>();

  connect(url: string) {
    this.url = url;
    this.desired = true;
    this.open();
  }

  disconnect() {
    this.desired = false;
    this.gen += 1;
    this.clearRetry();
    this.invalidateActive("error: session disconnected");
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    useSessionStore.getState().setSessionId(null);
    useSessionStore.getState().setConn("disconnected");
  }

  reinit() {
    useSessionStore.getState().setSessionId(null);
    this.send({
      type: "session.init",
      protocolVersion: 1,
      sampleRate: 16000,
      codec: "pcm16",
      ...(import.meta.env.VITE_USE_MOCK === "1"
        ? { scenario: useSessionStore.getState().scenario }
        : {}),
    });
  }

  beginTurn(): string | null {
    const store = useSessionStore.getState();
    if (this.ws?.readyState !== WebSocket.OPEN || !store.sessionId ||
        this.activeTurnId || this.processingTurnId || store.liveTrialId ||
        store.ttsActive) return null;
    const turnId = crypto.randomUUID();
    this.activeTurnId = turnId;
    this.sequence = 0;
    this.marks.set(turnId, {});
    useSessionStore.getState().beginTrial(turnId);
    this.send({ type: "utterance.begin", turnId });
    return turnId;
  }

  sendAudio(data: string) {
    if (!this.activeTurnId || this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({
      type: "audio.delta",
      turnId: this.activeTurnId,
      sequence: this.sequence++,
      data,
    });
  }

  endTurn() {
    const turnId = this.activeTurnId;
    if (!turnId) return;
    const client = this.marks.get(turnId) ?? {};
    client.released = performance.now();
    this.marks.set(turnId, client);
    this.processingTurnId = turnId;
    useSessionStore.getState().setProcessing(true);
    this.send({ type: "utterance.end", turnId });
    this.activeTurnId = null;
  }

  private send(evt: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(evt));
    }
  }

  private invalidateActive(message: string) {
    const hadTurn = this.activeTurnId || this.processingTurnId;
    this.activeTurnId = null;
    this.processingTurnId = null;
    this.marks.clear();
    this.sequence = 0;
    if (hadTurn) useSessionStore.getState().failActive(message);
    useSessionStore.getState().setRecording(false);
    useSessionStore.getState().setProcessing(false);
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
      const evt = result.data;
      if (evt.type === "error" && !evt.branch) {
        if (evt.turnId && evt.turnId !== this.activeTurnId &&
            evt.turnId !== this.processingTurnId) return;
        this.invalidateActive(`error: ${evt.message}`);
        if (!evt.turnId) useSessionStore.getState().setStatusLine(`error: ${evt.message}`);
        return;
      }
      dispatch(evt, this.marks);
      if (evt.type === "turn.profile" && evt.turnId === this.processingTurnId) {
        this.processingTurnId = null;
        useSessionStore.getState().setProcessing(false);
      }
    };

    ws.onclose = () => {
      if (gen !== this.gen) return;
      this.ws = null;
      useSessionStore.getState().setSessionId(null);
      useSessionStore.getState().setConn("disconnected");
      this.invalidateActive("error: connection lost during utterance");
      if (this.desired) {
        this.attempt += 1;
        const delay = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.open();
        }, delay);
      }
    };

    ws.onerror = () => ws.close();
  }
}

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  return proto + location.host + "/ws";
}

export const session = new SessionController();
