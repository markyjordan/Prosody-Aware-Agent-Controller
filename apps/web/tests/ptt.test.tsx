import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MicButton } from "../src/components/MicButton";
import { usePtt } from "../src/hooks/usePtt";
import type { RecorderApi } from "../src/hooks/useRecorder";
import { useSessionStore as store } from "../src/state/store";
import { session } from "../src/session/session";
import { deferred, render } from "./render";

let recorder: RecorderApi;
let ptt: ReturnType<typeof usePtt>;
let view: Awaited<ReturnType<typeof render>>;
function Harness() { ptt = usePtt(recorder); return null; }
const ready = () => store.setState({ conn: "connected", sessionId: "ready" });

beforeEach(async () => {
  recorder = {
    start: vi.fn(async () => { store.getState().setRecording(true); return true; }),
    stop: vi.fn(async () => { store.getState().setRecording(false); }),
    cancel: vi.fn(() => { store.getState().setRecording(false); }),
    analyserRef: { current: null },
  };
  vi.spyOn(session, "beginTurn").mockImplementation(() => store.getState().beginTrial("turn"));
  vi.spyOn(session, "endTurn").mockImplementation(() => {});
  view = await render(<Harness />);
});
afterEach(async () => { await view.unmount(); });

it.each([
  { conn: "connected" as const, sessionId: null },
  { starting: true }, { recording: true }, { processing: true },
  { ttsActive: true }, { liveTrialId: "busy" },
])("prevents start while blocked: %j", async (blocked) => {
  ready();
  store.setState(blocked);
  await act(async () => ptt.begin());
  expect(recorder.start).not.toHaveBeenCalled();
});

it("sends begin only after startup and end only after final audio flush", async () => {
  ready();
  const startup = deferred<boolean>();
  const stop = deferred<void>();
  vi.mocked(recorder.start).mockReturnValue(startup.promise);
  vi.mocked(recorder.stop).mockReturnValue(stop.promise);
  await act(async () => ptt.begin());
  expect(session.beginTurn).not.toHaveBeenCalled();
  await act(async () => { store.getState().setRecording(true); startup.resolve(true); });
  expect(session.beginTurn).toHaveBeenCalledTimes(1);
  await act(async () => { ptt.end(); ptt.end(); });
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(session.endTurn).not.toHaveBeenCalled();
  await act(async () => stop.resolve());
  expect(session.endTurn).toHaveBeenCalledTimes(1);
});

it("does not create a turn for canceled startup", async () => {
  ready();
  const startup = deferred<boolean>();
  vi.mocked(recorder.start).mockReturnValue(startup.promise);
  await act(async () => ptt.begin());
  await act(async () => { ptt.end(); startup.resolve(false); });
  expect(recorder.cancel).toHaveBeenCalled();
  expect(session.beginTurn).not.toHaveBeenCalled();
});

it("reports denied microphone access without replacing the pending opener", async () => {
  ready();
  const opener = store.getState().pendingOpener;
  vi.mocked(recorder.start).mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  await act(async () => ptt.begin());
  expect(store.getState().statusLine).toContain("allow access");
  expect(store.getState().pendingOpener).toBe(opener);
});

it.each(["input", "textarea", "select", "button", "a", "div"])(
  "does not intercept Space on an interactive %s", async (tag) => {
    ready();
    const target = document.createElement(tag);
    if (tag === "a") target.setAttribute("href", "#");
    if (tag === "div") target.setAttribute("contenteditable", "true");
    view.container.append(target);
    const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true });
    await act(async () => target.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(recorder.start).not.toHaveBeenCalled();
  },
);

it("supports global Space hold and ends on keyup even if focus moved", async () => {
  ready();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
  expect(recorder.start).toHaveBeenCalledTimes(1);
  const input = document.createElement("input");
  view.container.append(input);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", bubbles: true })));
  expect(recorder.stop).toHaveBeenCalledTimes(1);
});

it("supports global Space toggle without stopping on keyup", async () => {
  ready();
  store.getState().setPttMode("toggle");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
  await act(async () => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" })));
  expect(recorder.stop).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })));
  expect(recorder.stop).toHaveBeenCalledTimes(1);
});

it("ends recording on window blur and cancels on session loss", async () => {
  ready();
  await act(async () => ptt.begin());
  await act(async () => window.dispatchEvent(new Event("blur")));
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  await act(async () => store.getState().setSessionId(null));
  expect(recorder.cancel).toHaveBeenCalled();
});

it("captures pointer release and cancellation on the microphone button", async () => {
  await view.unmount();
  ready();
  view = await render(<MicButton recorder={recorder} />);
  const button = view.container.querySelector<HTMLButtonElement>('[aria-label="start recording"]')!;
  let captured = false;
  button.setPointerCapture = vi.fn(() => { captured = true; });
  button.hasPointerCapture = vi.fn(() => captured);
  button.releasePointerCapture = vi.fn(() => { captured = false; });
  const pointer = (type: string) => {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, { button: 0, isPrimary: true, pointerId: 7 });
    return event;
  };
  await act(async () => button.dispatchEvent(pointer("pointerdown")));
  expect(button.setPointerCapture).toHaveBeenCalledWith(7);
  await act(async () => button.dispatchEvent(pointer("pointerup")));
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(button.releasePointerCapture).toHaveBeenCalledWith(7);
  await act(async () => { store.getState().setRecording(true); button.dispatchEvent(pointer("pointercancel")); });
  expect(recorder.stop).toHaveBeenCalledTimes(2);
});
