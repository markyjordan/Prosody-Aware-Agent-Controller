import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import type { RecorderApi } from "../hooks/useRecorder";
import { usePtt } from "../hooks/usePtt";
import { Icon } from "./Icon";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: `2px solid ${tokens.border}`,
    backgroundColor: tokens.surface,
    color: tokens.textPrimary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "border-color 0.15s, box-shadow 0.15s",
    touchAction: "none",
  },
  idleHover: {
    ":hover": { borderColor: tokens.accent },
  },
  recording: {
    borderColor: tokens.recording,
    color: tokens.recording,
    animationName: stylex.keyframes({
      "0%": { boxShadow: `0 0 0 4px ${tokens.recording}33` },
      "50%": { boxShadow: `0 0 0 10px ${tokens.recording}11` },
      "100%": { boxShadow: `0 0 0 4px ${tokens.recording}33` },
    }),
    animationDuration: "1.2s",
    animationIterationCount: "infinite",
  },
  disabled: { opacity: 0.4, cursor: "default" },
  modeToggle: {
    width: "auto",
    height: 28,
    borderRadius: 999,
    padding: "0 12px",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: tokens.textSecondary,
  },
});

export function MicButton({ recorder }: { recorder: RecorderApi }) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const starting = useSessionStore((s) => s.starting);
  const processing = useSessionStore((s) => s.processing);
  const conn = useSessionStore((s) => s.conn);
  const recording = useSessionStore((s) => s.recording);
  const ttsActive = useSessionStore((s) => s.ttsActive);
  const pttMode = useSessionStore((s) => s.pttMode);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const setPttMode = useSessionStore((s) => s.setPttMode);

  const { begin, end } = usePtt(recorder);
  const busy = !sessionId || conn !== "connected" || liveTrialId !== null ||
    starting || processing || ttsActive;
  const disabled = busy && !recording && !starting;

  return (
    <div {...stylex.props(styles.row)}>
      <button
        type="button"
        onClick={() => setPttMode(pttMode === "hold" ? "toggle" : "hold")}
        disabled={starting || recording || processing || liveTrialId !== null}
        title="switch push-to-talk mode"
        {...stylex.props(styles.button, styles.modeToggle)}
      >
        {pttMode === "hold" ? "hold" : "toggle"}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={recording}
        aria-label={starting ? "cancel microphone startup" : recording ? "stop recording" : "start recording"}
        title={
          pttMode === "hold"
            ? "Hold to talk (or hold Space)"
            : "Click to talk (or press Space)"
        }
        {...stylex.props(
          styles.button,
          recording ? styles.recording : styles.idleHover,
          disabled ? styles.disabled : null,
        )}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (pttMode === "hold") begin();
        }}
        onPointerUp={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          if (pttMode === "hold") end();
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          if (pttMode === "hold") end();
        }}
        onLostPointerCapture={() => { if (pttMode === "hold") end(); }}
        onKeyDown={(e) => {
          if (pttMode !== "hold" || !["Space", "Enter"].includes(e.code)) return;
          e.preventDefault();
          if (!e.repeat) begin();
        }}
        onKeyUp={(e) => {
          if (pttMode !== "hold" || !["Space", "Enter"].includes(e.code)) return;
          e.preventDefault();
          end();
        }}
        onBlur={() => { if (pttMode === "hold") end(); }}
        onClick={() => {
          if (pttMode === "toggle") (recording || starting ? end : begin)();
        }}
      >
        {recording ? (
          <Icon name="stop" size={24} fill={true} />
        ) : (
          <Icon name="mic" size={24} />
        )}
      </button>
    </div>
  );
}
