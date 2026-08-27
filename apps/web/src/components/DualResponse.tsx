import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import type { BranchState } from "../state/store";

const styles = stylex.create({
  gridDesktop: {
    display: "none",
    marginTop: 14,
    width: "100%",
    gap: 10,
    textAlign: "left",
    "@media (min-width: 720px)": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
    },
  },
  pane: {
    borderRadius: 10,
    border: `1px solid ${tokens.border}`,
    padding: "10px 12px",
    minHeight: 56,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    textAlign: "left",
    userSelect: "text",
    overflowWrap: "anywhere",
  },
  baselinePane: { backgroundColor: tokens.baselineTint },
  prosodicPane: { backgroundColor: tokens.prosodicTint },
  labelRow: {
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: tokens.textMuted,
    textTransform: "uppercase",
  },
  thinking: { color: tokens.textMuted },

  tabbed: {
    display: "inline-flex",
    flexDirection: "column",
    marginTop: 14,
    width: "auto",
    maxWidth: "88%",
    alignSelf: "flex-start",
    borderRadius: 10,
    border: `1px solid ${tokens.border}`,
    overflow: "hidden",
    textAlign: "left",
    "@media (min-width: 720px)": {
      display: "none",
    },
  },
  tabbedBaseline: { backgroundColor: tokens.baselineTint },
  tabbedProsodic: { backgroundColor: tokens.prosodicTint },
  tabBar: {
    display: "flex",
    justifyContent: "flex-start",
    gap: 4,
    padding: "0 6px",
  },
  tab: {
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    backgroundColor: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderBottomWidth: 2,
    borderStyle: "solid",
    borderColor: "transparent",
    appearance: "none",
  },
  tabOn: {
    color: tokens.accent,
    borderColor: tokens.accent,
  },
  tabOff: {
    color: tokens.textMuted,
    borderColor: "transparent",
  },
  tabBody: {
    padding: "10px 12px",
    minHeight: 56,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    userSelect: "text",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    minWidth: 0,
    boxSizing: "border-box",
  },
});

function Pane({
  label,
  state,
  tinted,
}: {
  label: string;
  state: BranchState;
  tinted: "baseline" | "prosodic";
}) {
  return (
    <div
      {...stylex.props(
        styles.pane,
        tinted === "baseline" ? styles.baselinePane : styles.prosodicPane,
      )}
    >
      <div {...stylex.props(styles.labelRow)}>
        <span {...stylex.props(styles.label)}>{label}</span>
      </div>
      {state.text ? (
        <span>{state.text}</span>
      ) : (
        <span {...stylex.props(styles.thinking)}>…</span>
      )}
    </div>
  );
}

const TABS = [
  { id: "baseline" as const, label: "Text Only" },
  { id: "prosodic" as const, label: "Prosody-Aware" },
];

export function DualResponse({
  baseline,
  prosodic,
}: {
  baseline: BranchState;
  prosodic: BranchState;
}) {
  const [tab, setTab] = useState<"baseline" | "prosodic">("baseline");
  const branches = { baseline, prosodic };
  const active = branches[tab];

  return (
    <>
      <div {...stylex.props(styles.gridDesktop)}>
        <Pane label="Text Only" state={baseline} tinted="baseline" />
        <Pane label="Prosody-Aware" state={prosodic} tinted="prosodic" />
      </div>
      <div
        {...stylex.props(
          styles.tabbed,
          tab === "baseline" ? styles.tabbedBaseline : styles.tabbedProsodic,
        )}
      >
        <div role="tablist" {...stylex.props(styles.tabBar)}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              {...stylex.props(styles.tab, tab === t.id ? styles.tabOn : styles.tabOff)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" {...stylex.props(styles.tabBody)}>
          {active.text ? (
            <span>{active.text}</span>
          ) : (
            <span {...stylex.props(styles.thinking)}>…</span>
          )}
        </div>
      </div>
    </>
  );
}
