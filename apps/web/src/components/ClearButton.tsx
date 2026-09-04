import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import { Icon } from "./Icon";

const styles = stylex.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textMuted,
    transition: "border-color 0.15s, color 0.15s, opacity 0.15s",
  },
  btnEnabled: {
    color: tokens.textPrimary,
    ":hover": {
      borderColor: tokens.accent,
      color: tokens.accent,
    },
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "default",
  },
});

export function ClearButton() {
  const busy = useSessionStore((s) => s.starting || s.recording ||
    s.processing || s.liveTrialId !== null || s.ttsActive);
  const clearTrials = useSessionStore((s) => s.clearTrials);
  const setStatusLine = useSessionStore((s) => s.setStatusLine);

  return (
    <button
      type="button"
      title="clear trials and select an opener"
      aria-label="clear all trials"
      disabled={busy}
      onClick={() => {
        if (busy) return;
        clearTrials();
        setStatusLine("trials cleared");
        window.setTimeout(() => {
          const cur = useSessionStore.getState().statusLine;
          if (cur === "trials cleared") {
            useSessionStore.getState().setStatusLine("");
          }
        }, 2000);
      }}
      {...stylex.props(
        styles.btn,
        busy ? styles.btnDisabled : styles.btnEnabled,
      )}
    >
      <Icon name="delete" size={18} />
    </button>
  );
}
