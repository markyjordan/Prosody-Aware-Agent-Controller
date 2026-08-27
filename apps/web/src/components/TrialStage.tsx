import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore, type Trial } from "../state/store";
import { DualResponse } from "./DualResponse";
import { ProsodyBadge } from "./ProsodyBadge";
import { Icon } from "./Icon";

const styles = stylex.create({
  wrap: {
    width: "100%",
    maxWidth: 620,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "28px 16px",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: tokens.textMuted,
    fontSize: 13,
    padding: 24,
    textAlign: "center",
  },
  emptyIcon: { opacity: 0.5 },
  archivedTag: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: tokens.textMuted,
    alignSelf: "flex-end",
  },
  transcriptBubble: {
    backgroundColor: tokens.userBubble,
    borderRadius: 10,
    padding: "10px 14px",
    maxWidth: "94%",
    fontSize: 15,
    lineHeight: 1.5,
    textAlign: "left",
    alignSelf: "flex-end",
    userSelect: "text",
    overflowWrap: "anywhere",
  },
  partial: { fontStyle: "italic", color: tokens.textSecondary },
  errorBubble: {
    border: `1px solid ${tokens.recording}`,
  },
  errorText: {
    color: tokens.recording,
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
});

function TrialCard({ trial, archived }: { trial: Trial; archived: boolean }) {
  const failed = trial.status === "error";
  return (
    <div {...stylex.props(styles.wrap)}>
      {archived ? (
        <div {...stylex.props(styles.archivedTag)}>archived trial</div>
      ) : null}
      <div
        {...stylex.props(
          styles.transcriptBubble,
          failed ? styles.errorBubble : null,
        )}
      >
        {trial.text ? (
          <span>{trial.text}</span>
        ) : (
          <span {...stylex.props(styles.partial)}>
            {trial.partialText || "…"}
          </span>
        )}
        {failed ? (
          <div {...stylex.props(styles.errorText)}>
            <Icon name="error" size={14} fill={true} />
            input failed
          </div>
        ) : null}
        <ProsodyBadge prosody={trial.prosody} />
      </div>
      {trial.status === "responding" || trial.status === "complete" ? (
        <DualResponse baseline={trial.baseline} prosodic={trial.prosodic} />
      ) : null}
    </div>
  );
}

export function TrialStage() {
  const trials = useSessionStore((s) => s.trials);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const inspectId = useSessionStore((s) => s.inspectId);

  let visible: Trial | undefined;
  if (liveTrialId) {
    visible = trials.find((t) => t.id === liveTrialId);
  } else if (inspectId) {
    visible = trials.find((t) => t.id === inspectId);
  } else {
    visible = trials.at(-1);
  }

  if (!visible) {
    return (
      <div {...stylex.props(styles.empty)}>
        <span {...stylex.props(styles.emptyIcon)}>
          <Icon name="graphic_eq" size={32} />
        </span>
        <span>no trials yet</span>
        <span>
          pick a scenario and press simulate — or plug in a microphone with
          VITE_MIC=1
        </span>
      </div>
    );
  }

  const archived = !liveTrialId && inspectId !== null && visible.id === inspectId;
  return <TrialCard trial={visible} archived={archived} />;
}
