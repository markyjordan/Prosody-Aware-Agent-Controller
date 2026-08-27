import { useCallback, useEffect } from "react";
import { session } from "../session/session";
import { useSessionStore } from "../state/store";
import type { RecorderApi } from "./useRecorder";

export function usePtt(recorder: RecorderApi) {
  const begin = useCallback(() => {
    const s = useSessionStore.getState();
    if (s.conn !== "connected" || s.liveTrialId || s.recording) return;
    s.setStatusLine("");
    void recorder.start()
      .then((started) => {
        if (!started) return;
        const st = useSessionStore.getState();
        if (st.conn !== "connected") {
          recorder.stop();
          session.send({ type: "utterance.end" });
          return;
        }
        st.beginTrial();
        session.send({ type: "utterance.begin" });
      })
      .catch((err: unknown) => {
        console.error("recorder failed to start:", err);
        useSessionStore.getState().failActive(micErrorMessage(err));
      });
  }, [recorder]);

  const end = useCallback(() => {
    const s = useSessionStore.getState();
    if (s.recording) {
      recorder.stop();
      session.send({ type: "utterance.end" });
    } else {
      recorder.cancel();
    }
  }, [recorder]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      const mode = useSessionStore.getState().pttMode;
      if (mode === "hold") {
        begin();
      } else if (useSessionStore.getState().recording) {
        end();
      } else {
        begin();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTypingTarget(e.target)) return;
      const mode = useSessionStore.getState().pttMode;
      if (mode === "hold") end();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [begin, end]);

  return { begin, end };
}

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)
  );
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "microphone blocked — allow access in the browser's site settings, then try again";
    case "NotFoundError":
      return "no microphone found";
    case "NotReadableError":
      return "microphone is in use by another application";
    case "NotSupportedError":
      return "microphone constraints not supported by this browser/device";
    case "AbortError":
      return "microphone startup was aborted";
    default:
      return `could not start microphone${
        err instanceof Error && err.message ? ` (${err.message})` : ""
      }`;
  }
}
