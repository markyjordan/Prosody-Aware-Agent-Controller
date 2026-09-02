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
  const hasTrials = useSessionStore((s) => s.trials.length > 0);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const clearTrials = useSessionStore((s) => s.clearTrials);
  const setStatusLine = useSessionStore((s) => s.setStatusLine);

  return (
    <button
      type="button"
      title={hasTrials ? "clear all trials" : "no trials to clear"}
      aria-label="clear all trials"
      disabled={!hasTrials || liveTrialId !== null}
      onClick={() => {
        if (!hasTrials) return;
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
        hasTrials && liveTrialId === null ? styles.btnEnabled : styles.btnDisabled,
      )}
    >
      <Icon name="delete" size={18} />
    </button>
  );
}
