import { useCallback, useState } from "react";
import { session } from "../session/session";
import { useSessionStore } from "../state/store";

const CHUNK_SAMPLES = 1600;
const CHUNK_COUNT = 10;
const CHUNK_INTERVAL_MS = 90;

function synthChunk(): string {
  const pcm = new Int16Array(CHUNK_SAMPLES);
  const t0 = Date.now();
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    const t = (t0 + i / 16) / 1000;
    const envelope = Math.min(1, i / 200);
    pcm[i] =
      (Math.sin(2 * Math.PI * 220 * t) * 0.35 +
        Math.sin(2 * Math.PI * 523 * t) * 0.15) *
      envelope *
      32767 *
      0.6;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useSimulate() {
  const [busy, setBusy] = useState(false);

  const simulate = useCallback(async () => {
    const s = useSessionStore.getState();
    if (s.conn !== "connected" || s.liveTrialId || s.recording || busy) {
      return;
    }
    setBusy(true);
    s.setStatusLine("");
    s.beginTrial();
    session.send({ type: "utterance.begin" });
    const chunk = synthChunk();
    try {
      for (let i = 0; i < CHUNK_COUNT; i++) {
        session.send({ type: "audio.delta", data: chunk });
        await sleep(CHUNK_INTERVAL_MS);
      }
    } finally {
      session.send({ type: "utterance.end" });
      setBusy(false);
    }
  }, [busy]);

  return { simulate, busy };
}
