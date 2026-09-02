import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSimulate } from "../hooks/useSimulate";
import { useSessionStore } from "../state/store";
import { Icon } from "./Icon";

const styles = stylex.create({
  button: {
    height: 44,
    borderRadius: 999,
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textPrimary,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "0 24px",
    transition: "border-color 0.15s",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  hover: {
    ":hover": { borderColor: tokens.accent },
  },
  disabled: { opacity: 0.4, cursor: "default" },
});

export function SimulateButton() {
  const { simulate, busy } = useSimulate();
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const conn = useSessionStore((s) => s.conn);
  const ttsActive = useSessionStore((s) => s.ttsActive);
  const disabled =
    busy || liveTrialId !== null || conn !== "connected" || ttsActive;

  return (
    <button
      type="button"
      onClick={() => void simulate()}
      disabled={disabled}
      title="stream a synthetic utterance over the WebSocket and play the canned A/B response"
      {...stylex.props(
        styles.button,
        disabled ? styles.disabled : styles.hover,
      )}
    >
      <Icon name="play_arrow" size={18} fill={true} />
      {busy ? "simulating…" : "simulate"}
    </button>
  );
}
