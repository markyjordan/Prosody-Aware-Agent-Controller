import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import type { Prosody, ProsodyFeatures } from "../protocol";

const styles = stylex.create({
  wrap: { marginTop: 6 },
  pillRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: tokens.accentSoft,
    border: `1px solid ${tokens.border}`,
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 12,
    color: tokens.textPrimary,
  },
  labels: { fontWeight: 600, color: tokens.accent },
  confidence: { color: tokens.textMuted, fontSize: 11 },
  details: {
    marginTop: 4,
    fontSize: 11,
    color: tokens.textMuted,
  },
  summary: {
    cursor: "pointer",
    userSelect: "none",
  },
  table: {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: "2px 14px",
    marginTop: 4,
  },
  key: { color: tokens.textMuted },
  val: { fontVariantNumeric: "tabular-nums", color: tokens.textSecondary },
});

const FEATURE_ROWS: Array<{ key: keyof ProsodyFeatures; label: string; unit: string }> = [
  { key: "f0Mean", label: "f0 mean", unit: "Hz" },
  { key: "f0Range", label: "f0 range", unit: "Hz" },
  { key: "energy", label: "energy", unit: "dBFS" },
  { key: "speechRate", label: "rate", unit: "syl/s" },
];

export function ProsodyBadge({ prosody }: { prosody?: Prosody }) {
  if (!prosody || (prosody.labels.length === 0 && !prosody.features)) {
    return null;
  }
  const hasFeatures = Boolean(prosody.features);
  const conf =
    prosody.confidence != null
      ? `${Math.round(prosody.confidence * 100)}%`
      : null;
  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.pillRow)}>
        <span {...stylex.props(styles.labels)}>
          {prosody.labels.join(" · ")}
        </span>
        {conf ? <span {...stylex.props(styles.confidence)}>{conf}</span> : null}
      </div>
      {hasFeatures ? (
        <details {...stylex.props(styles.details)}>
          <summary {...stylex.props(styles.summary)}>features</summary>
          <div {...stylex.props(styles.table)}>
            {FEATURE_ROWS.map(({ key, label, unit }) => {
              const v = prosody.features?.[key];
              return [
                <span key={`${key}-k`} {...stylex.props(styles.key)}>
                  {label}
                </span>,
                <span key={`${key}-v`} {...stylex.props(styles.val)}>
                  {v == null ? "--" : `${v.toFixed(1)} ${unit}`}
                </span>,
              ];
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}
