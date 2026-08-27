import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import { Icon } from "./Icon";

const styles = stylex.create({
  strip: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    padding: "2px 2px 6px",
    scrollbarWidth: "thin",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    borderRadius: 999,
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textSecondary,
    fontSize: 12,
    padding: "5px 12px",
    whiteSpace: "nowrap",
    transition: "border-color 0.15s",
  },
  chipSelected: {
    borderColor: tokens.accent,
    color: tokens.textPrimary,
  },
  index: {
    color: tokens.textMuted,
    fontVariantNumeric: "tabular-nums",
  },
  label: {
    color: tokens.accent,
    fontWeight: 600,
  },
  statusOk: { color: tokens.ok, display: "inline-flex" },
  statusErr: { color: tokens.recording, display: "inline-flex" },
  statusLive: {
    color: tokens.warn,
    display: "inline-flex",
    animationName: stylex.keyframes({
      "0%": { opacity: 1 },
      "50%": { opacity: 0.3 },
      "100%": { opacity: 1 },
    }),
    animationDuration: "1s",
    animationIterationCount: "infinite",
  },
});

export function TrialLog() {
  const trials = useSessionStore((s) => s.trials);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const inspectId = useSessionStore((s) => s.inspectId);
  const inspect = useSessionStore((s) => s.inspect);

  if (trials.length === 0) return null;

  return (
    <div {...stylex.props(styles.strip)} role="log" aria-label="trial log">
      {[...trials].reverse().map((t) => {
        const n = trials.indexOf(t) + 1;
        const isLive = t.id === liveTrialId;
        const selected = isLive ? !inspectId : t.id === inspectId;
        const snippet = (t.text || t.partialText || "…").slice(0, 22);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={selected}
            title={t.text || t.partialText || "(empty)"}
            onClick={() => {
              if (isLive) inspect(null);
              else if (selected) inspect(null);
              else inspect(t.id);
            }}
            {...stylex.props(styles.chip, selected ? styles.chipSelected : null)}
          >
            <span {...stylex.props(styles.index)}>#{n}</span>
            <span>“{snippet}”</span>
            {t.prosody?.labels[0] ? (
              <span {...stylex.props(styles.label)}>
                ·{t.prosody.labels[0]}
              </span>
            ) : null}
            {t.status === "complete" ? (
              <span {...stylex.props(styles.statusOk)}>
                <Icon name="check_circle" size={13} fill={true} />
              </span>
            ) : t.status === "error" ? (
              <span {...stylex.props(styles.statusErr)}>
                <Icon name="cancel" size={13} fill={true} />
              </span>
            ) : isLive ? (
              <span {...stylex.props(styles.statusLive)}>
                <Icon name="fiber_manual_record" size={11} fill={true} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
