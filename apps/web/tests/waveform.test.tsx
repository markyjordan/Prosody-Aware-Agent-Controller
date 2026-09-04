import { act } from "react";
import { expect, it, vi } from "vitest";
import { RealtimeWaveform } from "../src/components/RealtimeWaveform";
import type { RecorderApi } from "../src/hooks/useRecorder";
import { useSessionStore as store } from "../src/state/store";
import { render } from "./render";

it("reads the shared analyser only while recording and disposes drawing resources", async () => {
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 0,
    fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = disconnect; });
  let draw!: FrameRequestCallback;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => { draw = callback; return 1; }));
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const analyser = { fftSize: 1024, getByteTimeDomainData: vi.fn((data: Uint8Array) => data.fill(160)) };
  const recorder = { analyserRef: { current: analyser } } as unknown as RecorderApi;
  const colors = { bg: "white", track: "gray", live: "blue" };
  const view = await render(<RealtimeWaveform recorder={recorder} colors={colors} />);
  try {
    expect(analyser.getByteTimeDomainData).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("idle");
    await act(async () => store.getState().setRecording(true));
    draw(0);
    expect(analyser.getByteTimeDomainData).toHaveBeenCalledTimes(1);
    expect(context.strokeStyle).toBe("blue");
    expect(view.container.textContent).not.toContain("simulation");
    await act(async () => store.getState().setRecording(false));
    draw(1);
    expect(analyser.getByteTimeDomainData).toHaveBeenCalledTimes(1);
    expect(context.strokeStyle).toBe("gray");
    await view.rerender(<RealtimeWaveform recorder={recorder} colors={{ ...colors, track: "black" }} />);
    draw(2);
    expect(context.strokeStyle).toBe("black");
  } finally { await view.unmount(); }
  expect(cancel).toHaveBeenCalledWith(1);
  expect(disconnect).toHaveBeenCalledTimes(1);
});
