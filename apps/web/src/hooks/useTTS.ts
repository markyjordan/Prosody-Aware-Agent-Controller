import { useCallback, useRef, useState } from "react";
import type { Branch } from "../protocol";
import { useSessionStore } from "../state/store";

type TTSStatus = "idle" | "loading" | "playing" | "error";

const VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const MODEL_ID = "eleven_flash_v2_5";

interface Correlation {
  turnId: string;
  branch: Branch;
}

function waitFor(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener("error", () => reject(new Error(`${event} failed`)), {
      once: true,
    });
  });
}

async function appendBuffer(buffer: SourceBuffer, data: Uint8Array) {
  if (buffer.updating) await waitFor(buffer, "updateend");
  buffer.appendBuffer(data as Uint8Array<ArrayBuffer>);
  await waitFor(buffer, "updateend");
}

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [status, setStatus] = useState<TTSStatus>("idle");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setStatus("idle");
    setActiveKey(null);
    useSessionStore.getState().setTtsActive(false);
  }, []);

  const play = useCallback(
    async (text: string, key: string, correlation: Correlation) => {
      if (!text.trim()) return;
      if (activeKey === key && status === "playing") {
        stop();
        return;
      }
      if (useSessionStore.getState().ttsActive) return;
      stop();
      setError(null);
      setStatus("loading");
      setActiveKey(key);
      useSessionStore.getState().setTtsActive(true);

      const clicked = performance.now();
      let firstByte: number | undefined;
      let playbackStart: number | undefined;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const sessionId = useSessionStore.getState().sessionId;
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            voice_id: VOICE_ID,
            model_id: MODEL_ID,
            session_id: sessionId,
            turn_id: correlation.turnId,
            branch: correlation.branch,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const body = await response.text().catch(() => "");
          throw new Error(`TTS ${response.status}: ${body || response.statusText}`);
        }

        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.onended = () => {
          const ended = performance.now();
          useSessionStore.getState().applyTtsProfile(
            correlation.turnId,
            correlation.branch,
            {
              click_to_first_byte_ms: firstByte ? firstByte - clicked : 0,
              click_to_playback_ms: playbackStart ? playbackStart - clicked : 0,
              playback_duration_ms: playbackStart ? ended - playbackStart : 0,
            },
          );
          setStatus("idle");
          setActiveKey(null);
          useSessionStore.getState().setTtsActive(false);
        };
        audio.onerror = () => {
          setError("audio playback failed");
          setStatus("error");
          useSessionStore.getState().setTtsActive(false);
        };

        const canStream =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported("audio/mpeg");
        if (canStream) {
          const mediaSource = new MediaSource();
          const url = URL.createObjectURL(mediaSource);
          urlRef.current = url;
          audio.src = url;
          await waitFor(mediaSource, "sourceopen");
          const source = mediaSource.addSourceBuffer("audio/mpeg");
          const reader = response.body.getReader();
          let started = false;
          for (;;) {
            const result = await reader.read();
            if (result.done) break;
            if (!result.value.length) continue;
            firstByte ??= performance.now();
            await appendBuffer(source, result.value);
            if (!started) {
              started = true;
              setStatus("playing");
              await audio.play();
              playbackStart = performance.now();
            }
          }
          if (mediaSource.readyState === "open" && !source.updating) {
            mediaSource.endOfStream();
          }
        } else {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const result = await reader.read();
            if (result.done) break;
            if (result.value.length) {
              firstByte ??= performance.now();
              chunks.push(result.value);
            }
          }
          const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          audio.src = url;
          setStatus("playing");
          await audio.play();
          playbackStart = performance.now();
        }
      } catch (caught) {
        if ((caught as DOMException)?.name === "AbortError") {
          setStatus("idle");
          useSessionStore.getState().setTtsActive(false);
          return;
        }
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        setStatus("error");
        useSessionStore.getState().setTtsActive(false);
        console.warn("[TTS] failed", message);
        setTimeout(() => setError(null), 2500);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [activeKey, status, stop],
  );

  return { play, stop, status, activeKey, error };
}
