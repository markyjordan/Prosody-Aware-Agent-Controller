import { useCallback, useEffect, useRef } from "react";
import { session } from "../session/session";
import { useSessionStore } from "../state/store";
import type { RecorderApi } from "./useRecorder";

export function usePtt(recorder: RecorderApi) {
  const ending = useRef(false);
  const begin = useCallback(() => {
    const s = useSessionStore.getState();
    if (!s.sessionId || s.conn !== "connected" || s.liveTrialId || s.starting ||
        s.recording || s.processing || s.ttsActive || ending.current) return;
    s.setStatusLine("");
    void recorder.start().then((started) => {
      if (!started) return;
      if (!session.beginTurn()) recorder.cancel();
    }).catch((error: unknown) => {
      useSessionStore.getState().failActive(`error: ${micErrorMessage(error)}`);
    });
  }, [recorder]);

  const end = useCallback(() => {
    if (ending.current) return;
    if (!useSessionStore.getState().recording) { recorder.cancel(); return; }
    ending.current = true;
    void recorder.stop().then(() => session.endTurn()).finally(() => {
      ending.current = false;
    });
  }, [recorder]);

  useEffect(() => {
    let spaceHeld = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isInteractiveTarget(e.target)) return;
      e.preventDefault();
      spaceHeld = true;
      const state = useSessionStore.getState();
      if (state.pttMode === "toggle" && (state.recording || state.starting)) end();
      else begin();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !spaceHeld) return;
      spaceHeld = false;
      e.preventDefault();
      if (useSessionStore.getState().pttMode === "hold") end();
    };
    const onBlur = () => { spaceHeld = false; end(); };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      if ((previous.sessionId && !state.sessionId) ||
          (previous.conn === "connected" && state.conn !== "connected")) recorder.cancel();
      if (previous.liveTrialId && !state.liveTrialId && state.recording) recorder.cancel();
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      recorder.cancel();
    };
  }, [begin, end, recorder]);
  return { begin, end };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [role="combobox"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [tabindex]',
  ));
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
