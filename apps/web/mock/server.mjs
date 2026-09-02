import http from "node:http";
import { WebSocketServer } from "ws";
import { scenarioById } from "./scenarios.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tokenize(text) {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

function streamSSE(res, text, { error = null } = {}) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const words = tokenize(text).filter((t) => t.trim().length > 0);

  (async () => {
    try {
      if (error) {
        res.write(
          `data: ${JSON.stringify({ type: "error", message: error })}\n\n`,
        );
        return;
      }
      for (const w of words) {
        if (res.closed || res.destroyed) return;
        res.write(`data: ${JSON.stringify({ type: "delta", text: w + " " })}\n\n`);
        await sleep(45 + Math.random() * 55);
      }
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch {
      // client disconnected
    } finally {
      res.end();
    }
  })();
}

function handleCondition(req, res) {
  const branch = req.url.split("/").pop();
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {}
    const MIN_AUDIO_BYTES = 1600;
    const noAudio = !payload.turn?.transcript && branch === undefined;

    const sc = scenarioById(payload.scenario);
    const reply = branch === "prosodic" ? sc.prosodic : sc.baseline;

    streamSSE(res, reply, {
      error:
        !payload.turn?.transcript && !payload.scenario
          ? "condition request missing transcript"
          : noAudio
            ? "utterance contained no audio"
            : null,
    });
  });
}

export function startServer(port = 8787) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/api/condition/")) {
      handleCondition(req, res);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let scenarioId = null;
    let bytesReceived = 0;
    let activeTurnId = null;
    let nextSequence = 0;
    const usedTurnIds = new Set();
    const sessionId = crypto.randomUUID();

    const send = (obj) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
    };

    ws.on("message", (rawMsg) => {
      let evt;
      try {
        evt = JSON.parse(rawMsg.toString());
      } catch {
        return;
      }
      switch (evt.type) {
        case "session.init":
          scenarioId = evt.scenario ?? null;
          bytesReceived = 0;
          send({ type: "session.ready", sessionId, protocolVersion: 1 });
          break;
        case "utterance.begin":
          if (!evt.turnId || activeTurnId || usedTurnIds.has(evt.turnId)) {
            send({
              type: "error",
              code: "invalid_turn",
              message: "turnId must be unique and no turn may already be active",
              turnId: evt.turnId,
              stage: "ingress",
              retryable: false,
            });
            break;
          }
          activeTurnId = evt.turnId;
          usedTurnIds.add(evt.turnId);
          bytesReceived = 0;
          nextSequence = 0;
          break;
        case "audio.delta":
          if (evt.turnId !== activeTurnId || evt.sequence !== nextSequence) {
            send({
              type: "error",
              code: "out_of_order_audio",
              message: `expected sequence ${nextSequence}`,
              turnId: evt.turnId,
              stage: "ingress",
              retryable: false,
            });
            activeTurnId = null;
            break;
          }
          nextSequence += 1;
          bytesReceived += Buffer.byteLength(evt.data ?? "", "base64");
          break;
        case "utterance.end":
          if (evt.turnId === activeTurnId) {
            activeTurnId = null;
            void playTurn(evt.turnId, bytesReceived, scenarioId);
          }
          break;
        default:
          break;
      }
    });

    async function playTurn(turnId, bytes, scenId) {
      const sc = scenarioById(scenId);
      const speechSecs = Math.min(2.5, Math.max(0.4, bytes / 2 / 16000));
      const words = tokenize(sc.utterance);

      for (let i = 1; i <= words.length; i++) {
        send({ type: "asr.partial", turnId, text: words.slice(0, i).join("") });
        await sleep(Math.min(220, (speechSecs * 1000) / words.length));
      }
      await sleep(120);

      send({
        type: "prosody.update",
        turnId,
        prosody: { labels: [], features: sc.features },
      });
      send({
        type: "asr.final",
        turnId,
        text: sc.utterance,
        prosody: {
          labels: sc.labels,
          features: sc.features,
          confidence: sc.confidence,
        },
      });

      const started = performance.now();
      await Promise.all([
        streamBranch(turnId, "baseline", sc.baseline),
        streamBranch(turnId, "prosodic", sc.prosodic),
      ]);
      const total = performance.now() - started;
      send({
        type: "turn.profile",
        turnId,
        profile: {
          schema_version: 1,
          kind: "turn",
          session_id: sessionId,
          turn_id: turnId,
          outcome: "ok",
          providers: { asr: "mock", llm: "mock" },
          durations_ms: {
            asr_commit: 120,
            prosody_finalize: 40,
            release_to_first_text: 180,
            release_to_done: Math.round(total),
          },
        },
      });
    }

    async function streamBranch(turnId, branch, text) {
      for (const token of tokenize(text)) {
        send({ type: "response.delta", turnId, branch, text: token });
        await sleep(25);
      }
      send({ type: "response.done", turnId, branch });
    }
  });

  server.listen(port, () => {
    console.log(`[mock] voice ws + condition http on :${port}`);
  });
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  startServer(Number(process.env.MOCK_PORT ?? 8787));
}
