import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRecorder, type RecorderApi } from "../src/hooks/useRecorder";
import { useSessionStore as store } from "../src/state/store";
import { deferred, render } from "./render";

class AudioNodeDouble {
  connect = vi.fn();
  disconnect = vi.fn();
}
class Worklet extends AudioNodeDouble {
  static latest: Worklet;
  port = { onmessage: null as null | ((event: { data: unknown }) => void), postMessage: vi.fn() };
  constructor() { super(); Worklet.latest = this; }
  emit(data: unknown) { this.port.onmessage?.({ data }); }
}
class Context {
  static latest: Context;
  static module = () => Promise.resolve();
  state = "running";
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: vi.fn(() => Context.module()) };
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = "closed"; });
  createMediaStreamSource = vi.fn(() => new AudioNodeDouble());
  createAnalyser = vi.fn(() => Object.assign(new AudioNodeDouble(), { fftSize: 1024 }));
  createGain = vi.fn(() => Object.assign(new AudioNodeDouble(), { gain: { value: 1 } }));
  constructor() { Context.latest = this; }
}
let api: RecorderApi;
let chunks: ReturnType<typeof vi.fn>;
let stopTrack: ReturnType<typeof vi.fn>;
let media: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let view: Awaited<ReturnType<typeof render>>;
function Harness() { api = useRecorder({ onChunk: chunks }); return null; }

beforeEach(async () => {
  Context.module = () => Promise.resolve();
  chunks = vi.fn();
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  media = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } });
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("AudioWorkletNode", Worklet);
  view = await render(<Harness />);
});
afterEach(async () => { await view.unmount(); });

it("does not request a microphone until start and cleans up denial", async () => {
  expect(media).not.toHaveBeenCalled();
  media.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
  await act(async () => { await expect(api.start()).rejects.toThrow("denied"); });
  expect(Context.latest.close).toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ starting: false, recording: false });
  await act(async () => { expect(await api.start()).toBe(true); });
});

it("cancels release during permission startup and prevents overlapping requests", async () => {
  const permission = deferred<MediaStream>();
  media.mockReturnValueOnce(permission.promise);
  let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(); });
  expect(store.getState().starting).toBe(true);
  await act(async () => {
    expect(await api.start()).toBe(false);
    api.cancel();
    permission.resolve(stream);
    expect(await pending).toBe(false);
  });
  expect(media).toHaveBeenCalledTimes(1);
  expect(stopTrack).toHaveBeenCalled();
  expect(Context.latest.close).toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ starting: false, recording: false });
});

it("cleans up a worklet setup failure after acquiring the microphone", async () => {
  Context.module = () => Promise.reject(new Error("worklet unavailable"));
  await act(async () => { await expect(api.start()).rejects.toThrow("worklet unavailable"); });
  expect(stopTrack).toHaveBeenCalled();
  expect(Context.latest.close).toHaveBeenCalled();
  expect(api.analyserRef.current).toBeNull();
});

it("waits for final worklet frames, resamples, flushes, then releases resources", async () => {
  await act(async () => { await api.start(); });
  const node = Worklet.latest;
  node.emit(new Float32Array(120).fill(0.5));
  expect(chunks).not.toHaveBeenCalled();
  let stopped = false;
  let stop!: Promise<void>;
  await act(async () => { stop = api.stop().then(() => { stopped = true; }); });
  expect(node.port.postMessage).toHaveBeenCalledWith("stop");
  expect(stopped).toBe(false);
  await act(async () => {
    node.emit(new Float32Array(120).fill(0.5));
    node.emit("stopped");
    await stop;
  });
  // 240 samples at 48 kHz become 80 PCM16 samples at 16 kHz.
  expect(Buffer.from(chunks.mock.calls[0][0], "base64")).toHaveLength(160);
  expect(stopTrack).toHaveBeenCalled();
  expect(api.analyserRef.current).toBeNull();
  expect(store.getState().recording).toBe(false);
});

it("discards rather than transmits audio when canceled during stop", async () => {
  await act(async () => { await api.start(); });
  Worklet.latest.emit(new Float32Array(128).fill(0.5));
  await act(async () => {
    const stop = api.stop();
    api.cancel();
    await stop;
  });
  expect(chunks).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
});

it("bounds an unresponsive worklet stop and reports the failure", async () => {
  vi.useFakeTimers();
  await act(async () => { await api.start(); });
  await act(async () => {
    const stop = api.stop();
    await vi.advanceTimersByTimeAsync(1000);
    await stop;
  });
  expect(store.getState().statusLine).toContain("microphone stopped responding");
  expect(store.getState().recording).toBe(false);
  expect(stopTrack).toHaveBeenCalled();
});

it("keeps the API stable across renders and releases the microphone on unmount", async () => {
  const original = api;
  await view.rerender(<Harness />);
  expect(api).toBe(original);
  await act(async () => { await api.start(); });
  await view.unmount();
  expect(stopTrack).toHaveBeenCalled();
  expect(api.analyserRef.current).toBeNull();
  // Replace the already unmounted fixture for afterEach.
  view = await render(<Harness />);
});

it("disposes a permission grant that arrives after unmount", async () => {
  const permission = deferred<MediaStream>();
  media.mockReturnValueOnce(permission.promise);
  let pending!: Promise<boolean>;
  await act(async () => { pending = api.start(); });
  await view.unmount();
  await act(async () => { permission.resolve(stream); expect(await pending).toBe(false); });
  expect(stopTrack).toHaveBeenCalled();
  expect(store.getState().recording).toBe(false);
  view = await render(<Harness />);
});
