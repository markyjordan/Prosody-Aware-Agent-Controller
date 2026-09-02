import WebSocket from "ws";
import { startServer } from "./server.mjs";

const PORT = 8799;
startServer(PORT);

const base = `http://localhost:${PORT}`;

// --- 1. unified voice ws: transcription + prosody + A/B + profile ---
const ws = new WebSocket(`ws://localhost:${PORT}`);
const seen = new Set();
const TURN_ID = "smoke-turn-1";

const phase1 = new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("ws timeout")), 10000);
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "session.init",
        protocolVersion: 1,
        sampleRate: 16000,
        codec: "pcm16",
        scenario: "uncertain-yes",
      }),
    );
    ws.send(JSON.stringify({ type: "utterance.begin", turnId: TURN_ID }));
    const chunk = Buffer.from(new Int16Array(16000).buffer).toString("base64");
    for (let i = 0; i < 16; i++) {
      ws.send(
        JSON.stringify({
          type: "audio.delta",
          turnId: TURN_ID,
          sequence: i,
          data: chunk,
        }),
      );
    }
    setTimeout(
      () => ws.send(JSON.stringify({ type: "utterance.end", turnId: TURN_ID })),
      200,
    );
  });
  ws.on("message", (raw) => {
    const evt = JSON.parse(raw.toString());
    seen.add(evt.type);
    if (evt.type === "turn.profile") {
      clearTimeout(t);
      resolve(evt);
    }
  });
  ws.on("error", reject);
});

const profileEvt = await phase1;
console.log("profile:", JSON.stringify(profileEvt.profile.durations_ms));

if (
  !seen.has("session.ready") ||
  !seen.has("asr.partial") ||
  !seen.has("asr.final") ||
  !seen.has("prosody.update") ||
  !seen.has("response.delta") ||
  !seen.has("response.done") ||
  !seen.has("turn.profile")
) {
  console.error("MISSING voice events:", [...seen]);
  process.exit(1);
}

// --- 2. condition endpoints: SSE fan-out ---
async function runCondition(branch, history, turn) {
  const res = await fetch(`${base}/api/condition/${branch}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history, turn, scenario: "uncertain-yes" }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let doneSeen = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const part of decoder.decode(value).split("\n\n")) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.type === "delta") text += evt.text;
      if (evt.type === "done") doneSeen = true;
    }
  }
  return { text: text.trim(), doneSeen };
}

const turn = { transcript: "Sure." };
const [baseline, prosodic] = await Promise.all([
  runCondition("baseline", [], turn),
  runCondition("prosodic", [], turn),
]);

console.log("[baseline]", baseline.text);
console.log("[prosodic]", prosodic.text);

// --- 3. multi-turn: history accepted without polluting text ---
const history = [
  { id: "1", role: "user", content: "Sure." },
  { id: "2", role: "assistant", content: baseline.text },
];
const second = await runCondition("baseline", history, {
  transcript: "Stop... wait.",
});
console.log("[turn2]", second.text);

if (
  !baseline.doneSeen ||
  !prosodic.doneSeen ||
  !second.doneSeen ||
  /turn \d/.test(second.text) ||
  /\(baseline:/.test(second.text) ||
  /\(prosodic:/.test(second.text)
) {
  console.error("SMOKE FAIL");
  process.exit(1);
}

ws.close();
console.log("V2 SMOKE PASS");
setTimeout(() => process.exit(0), 100);
