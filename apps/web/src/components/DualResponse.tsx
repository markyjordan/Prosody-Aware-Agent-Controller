import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import type { BranchState } from "../state/store";
import type { Branch } from "../protocol";
import { Icon } from "./Icon";
import { useTTS } from "../hooks/useTTS";

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
    maxWidth: "70%",
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
  ttsRow: {
    display: "flex",
    justifyContent: "flex-start",
    marginTop: 10,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textMuted,
    transition: "border-color 0.15s, color 0.15s, opacity 0.15s",
  },
  playBtnEnabled: {
    color: tokens.textPrimary,
    ":hover": {
      borderColor: tokens.accent,
      color: tokens.accent,
    },
  },
  playBtnDisabled: {
    opacity: 0.45,
    cursor: "default",
  },
});

function Pane({
  label,
  state,
  tinted,
  tts,
  ttsKey,
  turnId,
  branch,
}: {
  label: string;
  state: BranchState;
  tinted: "baseline" | "prosodic";
  tts: ReturnType<typeof useTTS>;
  ttsKey: string;
  turnId: string;
  branch: Branch;
}) {
  const hasText = Boolean(state.text);
  const isActive = tts.activeKey === ttsKey;
  const isLoading = isActive && tts.status === "loading";
  const isPlaying = isActive && tts.status === "playing";
  const icon = isLoading ? "progress_activity" : isPlaying ? "pause" : "play_arrow";
  const title = !hasText
    ? "no text to play yet"
    : isLoading
      ? "loading audio…"
      : isPlaying
        ? "pause"
        : "play with ElevenLabs (Flash v2.5)";

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
      {hasText ? (
        <span>{state.text}</span>
      ) : (
        <span {...stylex.props(styles.thinking)}>…</span>
      )}
      <div {...stylex.props(styles.ttsRow)}>
        <button
          type="button"
          aria-label={`play ${label} response`}
          title={title}
          disabled={!hasText || tts.status === "loading"}
          onClick={() => {
            void tts.play(state.text, ttsKey, { turnId, branch });
          }}
          {...stylex.props(
            styles.playBtn,
            hasText ? styles.playBtnEnabled : styles.playBtnDisabled,
          )}
        >
          <Icon name={icon} size={16} fill={true} />
        </button>
      </div>
    </div>
  );
}

const TABS = [
  { id: "baseline" as const, label: "Text Only" },
  { id: "prosodic" as const, label: "Prosody-Aware" },
];

export function DualResponse({
  turnId,
  baseline,
  prosodic,
}: {
  turnId: string;
  baseline: BranchState;
  prosodic: BranchState;
}) {
  const [tab, setTab] = useState<"baseline" | "prosodic">("baseline");
  const branches = { baseline, prosodic };
  const active = branches[tab];
  const tts = useTTS();
  const mobileKey = `mobile-${tab}`;
  const isMobileLoading = tts.activeKey === mobileKey && tts.status === "loading";
  const isMobilePlaying = tts.activeKey === mobileKey && tts.status === "playing";
  const mobileIcon = isMobileLoading
    ? "progress_activity"
    : isMobilePlaying
      ? "pause"
      : "play_arrow";
  const mobileTitle = !active.text
    ? "no text to play yet"
    : isMobileLoading
      ? "loading audio…"
      : isMobilePlaying
        ? "pause"
        : "play with ElevenLabs (Flash v2.5)";

  return (
    <>
      <div {...stylex.props(styles.gridDesktop)}>
        <Pane label="Text Only" state={baseline} tinted="baseline" tts={tts} ttsKey="desktop-baseline" turnId={turnId} branch="baseline" />
        <Pane label="Prosody-Aware" state={prosodic} tinted="prosodic" tts={tts} ttsKey="desktop-prosodic" turnId={turnId} branch="prosodic" />
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
          <div {...stylex.props(styles.ttsRow)}>
            <button
              type="button"
              aria-label={`play ${tab} response`}
              title={mobileTitle}
              disabled={!active.text || tts.status === "loading"}
              onClick={() => {
                void tts.play(active.text, mobileKey, { turnId, branch: tab });
              }}
              {...stylex.props(
                styles.playBtn,
                active.text ? styles.playBtnEnabled : styles.playBtnDisabled,
              )}
            >
              <Icon name={mobileIcon} size={16} fill={true} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
