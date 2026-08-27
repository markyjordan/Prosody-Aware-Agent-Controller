import { useEffect, useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import type { RecorderApi } from "../hooks/useRecorder";
import { useSessionStore } from "../state/store";

const styles = stylex.create({
  canvas: {
    flex: 1,
    height: 40,
    minWidth: 120,
    borderRadius: 8,
    "@media (max-width: 640px)": {
      height: 32,
      minWidth: 72,
    },
  },
});

export function Waveform({
  recorder,
  colors,
}: {
  recorder: RecorderApi;
  colors: { track: string; live: string; bg: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recording = useSessionStore((s) => s.recording);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const data = new Uint8Array(1024);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const c = colorsRef.current;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = recordingRef.current ? c.live : c.track;
      ctx.lineWidth = Math.max(1.5, (window.devicePixelRatio || 1) * 1.5);
      ctx.beginPath();

      const analyser = recorder.analyserRef.current;
      if (analyser && recordingRef.current) {
        analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
        const n = analyser.fftSize;
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const v = (data[i] - 128) / 128;
          const y = h / 2 + v * (h / 2 - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
      }
      ctx.stroke();
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [recorder.analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      {...stylex.props(styles.canvas)}
      style={{ backgroundColor: colors.bg }}
    />
  );
}
