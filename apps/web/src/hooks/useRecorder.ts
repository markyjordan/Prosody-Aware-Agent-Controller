import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useSessionStore } from "../state/store";

const TARGET_RATE = 16000;

class Resampler {
  private ratio: number;
  private phase = 0;
  private tail: Float32Array | null = null;

  constructor(
    private fromRate: number,
    private toRate: number,
  ) {
    this.ratio = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) return input;
    const src = this.tail ? concat(this.tail, input) : input;
    const outLength = Math.max(
      0,
      Math.floor((src.length - this.phase) / this.ratio),
    );
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = this.phase + i * this.ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = src[idx];
      const b = idx + 1 < src.length ? src[idx + 1] : a;
      out[i] = a + (b - a) * frac;
    }
    const consumed = Math.floor(this.phase + outLength * this.ratio);
    this.phase += outLength * this.ratio - consumed;
    this.tail = consumed < src.length ? src.slice(consumed) : null;
    return out;
  }
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function pcm16ToBase64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

interface RecorderOptions {
  onChunk?: (base64Pcm16: string) => void;
}

export interface RecorderApi {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  cancel: () => void;
  analyserRef: RefObject<AnalyserNode | null>;
}

interface Capture {
  ctx: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  analyser?: AnalyserNode;
  mute?: GainNode;
  cancelled: boolean;
  capturing: boolean;
  pending: Float32Array[];
  samples: number;
  resampler: Resampler;
  stopping?: Promise<void>;
  finish?: () => void;
}

function dispose(capture: Capture) {
  capture.capturing = false;
  capture.stream?.getTracks().forEach((track) => track.stop());
  capture.source?.disconnect();
  capture.node?.disconnect();
  capture.analyser?.disconnect();
  capture.mute?.disconnect();
  if (capture.node) capture.node.port.onmessage = null;
  if (capture.ctx.state !== "closed") void capture.ctx.close().catch(() => {});
}

export function useRecorder(options: RecorderOptions = {}): RecorderApi {
  const onChunkRef = useRef(options.onChunk);
  onChunkRef.current = options.onChunk;
  const captureRef = useRef<Capture | null>(null);
  const startingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const flush = useCallback((capture: Capture) => {
    if (!capture.samples) return;
    const merged = new Float32Array(capture.samples);
    let offset = 0;
    for (const chunk of capture.pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    capture.pending = [];
    capture.samples = 0;
    const samples = capture.resampler.process(merged);
    if (samples.length) onChunkRef.current?.(pcm16ToBase64(samples));
  }, []);

  const cancel = useCallback(() => {
    const capture = captureRef.current;
    if (capture) {
      capture.cancelled = true;
      capture.finish?.();
      dispose(capture);
    }
    captureRef.current = null;
    analyserRef.current = null;
    useSessionStore.getState().setRecording(false);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (startingRef.current || captureRef.current) return false;
    startingRef.current = true;
    useSessionStore.getState().setStarting(true);
    let capture: Capture | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("microphone access requires HTTPS or localhost");
      }
      let ctx: AudioContext;
      try {
        ctx = new AudioContext({ sampleRate: TARGET_RATE });
      } catch {
        ctx = new AudioContext();
      }
      capture = {
        ctx, cancelled: false, capturing: false, pending: [], samples: 0,
        resampler: new Resampler(ctx.sampleRate, TARGET_RATE),
      };
      captureRef.current = capture;
      const current = capture;
      current.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
      if (current.cancelled) { dispose(current); return false; }
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}recorder-worklet.js`);
      if (current.cancelled) { dispose(current); return false; }
      current.source = ctx.createMediaStreamSource(current.stream);
      current.node = new AudioWorkletNode(ctx, "recorder-processor", {
        channelCount: 1, channelCountMode: "explicit",
      });
      current.analyser = ctx.createAnalyser();
      current.analyser.fftSize = 1024;
      current.mute = ctx.createGain();
      current.mute.gain.value = 0;
      current.source.connect(current.node);
      current.source.connect(current.analyser);
      current.node.connect(current.mute);
      current.mute.connect(ctx.destination);
      current.node.port.onmessage = (event: MessageEvent<Float32Array | string>) => {
        if (current.cancelled) return;
        if (event.data === "stopped") { current.finish?.(); return; }
        if (!current.capturing || !(event.data instanceof Float32Array)) return;
        current.pending.push(event.data);
        current.samples += event.data.length;
        if (current.samples >= ctx.sampleRate / 10) flush(current);
      };
      await ctx.resume();
      if (current.cancelled) { dispose(current); return false; }
      current.capturing = true;
      analyserRef.current = current.analyser;
      useSessionStore.getState().setRecording(true);
      return true;
    } catch (error) {
      if (capture) dispose(capture);
      if (captureRef.current === capture) captureRef.current = null;
      if (capture?.cancelled) return false;
      throw error;
    } finally {
      startingRef.current = false;
      useSessionStore.getState().setStarting(false);
    }
  }, [flush]);

  const stop = useCallback((): Promise<void> => {
    const capture = captureRef.current;
    if (!capture?.capturing) { cancel(); return Promise.resolve(); }
    if (capture.stopping) return capture.stopping;
    capture.stopping = new Promise<void>((resolve) => {
      // Messages preceding the acknowledgement contain the final audio frames.
      const timeout = window.setTimeout(() => {
        useSessionStore.getState().setStatusLine("error: microphone stopped responding");
        capture.finish?.();
      }, 1000);
      capture.finish = () => {
        window.clearTimeout(timeout);
        capture.finish = undefined;
        if (!capture.cancelled) flush(capture);
        dispose(capture);
        if (captureRef.current === capture) {
          captureRef.current = null;
          analyserRef.current = null;
          useSessionStore.getState().setRecording(false);
        }
        resolve();
      };
      capture.node!.port.postMessage("stop");
    });
    return capture.stopping;
  }, [cancel, flush]);

  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ start, stop, cancel, analyserRef }), [start, stop, cancel]);
}
