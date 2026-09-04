import * as stylex from "@stylexjs/stylex";
import { useSessionStore } from "../state/store";
import type { RecorderApi } from "../hooks/useRecorder";
import { Waveform } from "./Waveform";

const styles = stylex.create({
  container: {
    display: "flex",
    flex: 1,
    minWidth: 72,
    overflow: "hidden",
  },
});

export function RealtimeWaveform({ recorder, colors }: {
  recorder: RecorderApi;
  colors: { track: string; live: string; bg: string };
}) {
  const recording = useSessionStore((s) => s.recording);
  return (
    <div
      role="img"
      aria-label={recording ? "Live microphone waveform" : "Microphone waveform idle"}
      {...stylex.props(styles.container)}
    >
      <Waveform recorder={recorder} colors={colors} />
    </div>
  );
}
