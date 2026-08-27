import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useSessionStore } from "../state/store";

const TARGET_RATE = 16000;
const CHUNK_SAMPLES = TARGET_RATE / 10;

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
  stop: () => void;
  cancel: () => void;
  analyserRef: RefObject<AnalyserNode | null>;
}

export function useRecorder(options: RecorderOptions = {}): RecorderApi {
  const onChunkRef = useRef(options.onChunk);
  onChunkRef.current = options.onChunk;

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const resamplerRef = useRef<Resampler | null>(null);
  const pendingRef = useRef<Float32Array[]>([]);
  const pendingLenRef = useRef(0);
  const capturingRef = useRef(false);
  const startingRef = useRef(false);
  const stopDesiredRef = useRef(false);

  const flush = useCallback((final: boolean) => {
    if (pendingLenRef.current === 0 && !final) return;
    const merged = new Float32Array(pendingLenRef.current);
    let offset = 0;
    for (const chunk of pendingRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pendingRef.current = [];
    pendingLenRef.current = 0;

    const resampled = resamplerRef.current?.process(merged) ?? merged;
    if (resampled.length > 0) {
      onChunkRef.current?.(pcm16ToBase64(resampled));
    }
    void final;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (capturingRef.current) return true;
    if (startingRef.current) return false;
    startingRef.current = true;
    stopDesiredRef.current = false;
    try {
      if (!ctxRef.current || !streamRef.current || !nodeRef.current) {
        let ctx: AudioContext;
        try {
          ctx = new AudioContext({ sampleRate: TARGET_RATE });
        } catch {
          ctx = new AudioContext();
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const workletUrl = `${import.meta.env.BASE_URL}recorder-worklet.js`;
        await ctx.audioWorklet.addModule(workletUrl);
        const source = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "recorder-processor");
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(node);
        source.connect(analyser);

        ctxRef.current = ctx;
        streamRef.current = stream;
        nodeRef.current = node;
        analyserRef.current = analyser;
        resamplerRef.current = new Resampler(ctx.sampleRate, TARGET_RATE);

        node.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (!capturingRef.current) return;
          pendingRef.current.push(e.data);
          pendingLenRef.current += e.data.length;
          if (pendingLenRef.current >= CHUNK_SAMPLES) flush(false);
        };
      }
      await ctxRef.current.resume();
    } finally {
      startingRef.current = false;
    }

    if (stopDesiredRef.current) {
      stopDesiredRef.current = false;
      return false;
    }
    pendingRef.current = [];
    pendingLenRef.current = 0;
    capturingRef.current = true;
    useSessionStore.getState().setRecording(true);
    return true;
  }, [flush]);

  const stop = useCallback(() => {
    if (!capturingRef.current) {
      stopDesiredRef.current = true;
      return;
    }
    capturingRef.current = false;
    flush(true);
    useSessionStore.getState().setRecording(false);
  }, [flush]);

  const cancel = useCallback(() => {
    stopDesiredRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      capturingRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    };
  }, []);

  return { start, stop, cancel, analyserRef };
}
