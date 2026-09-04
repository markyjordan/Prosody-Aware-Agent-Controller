import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore, type Trial } from "../state/store";
import { DualResponse } from "./DualResponse";
import { ProsodyBadge } from "./ProsodyBadge";
import { Icon } from "./Icon";

const styles = stylex.create({
  timeline: {
    width: "100%",
    maxWidth: 620,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 28,
    padding: "28px 16px",
  },
  wrap: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
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
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
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
  latency: {
    color: tokens.textMuted,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    marginTop: 6,
  },
});

function metric(
  profile: Record<string, unknown> | undefined,
  clientKey: string,
  serverKey = clientKey,
) {
  const durations = profile?.client_durations_ms as
    | Record<string, unknown>
    | undefined;
  const fallback = profile?.durations_ms as Record<string, unknown> | undefined;
  const value = durations?.[clientKey] ?? fallback?.[serverKey];
  return typeof value === "number" ? Math.round(value) : null;
}

function TrialCard({ trial, archived }: { trial: Trial; archived: boolean }) {
  const failed = trial.status === "error";
  const firstText = metric(
    trial.profile,
    "release_to_first_text_ms",
    "release_to_first_text",
  );
  const asr = metric(trial.profile, "asr_commit");
  const done = metric(
    trial.profile,
    "release_to_last_done_ms",
    "release_to_done",
  );
  const ttsEntry = Object.entries(trial.ttsProfiles ?? {}).at(-1);
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
        <DualResponse
          turnId={trial.id}
          baseline={trial.baseline}
          prosodic={trial.prosodic}
        />
      ) : null}
      {trial.profile ? (
        <div {...stylex.props(styles.latency)}>
          first text {firstText ?? "—"} ms · ASR {asr ?? "—"} ms · complete{" "}
          {done ?? "—"} ms
        </div>
      ) : null}
      {ttsEntry ? (
        <div {...stylex.props(styles.latency)}>
          {ttsEntry[0]} TTS first byte {Math.round(ttsEntry[1].click_to_first_byte_ms)} ms
          {" · "}first audio {Math.round(ttsEntry[1].click_to_playback_ms)} ms
        </div>
      ) : null}
    </div>
  );
}

export function TrialStage() {
  const trials = useSessionStore((s) => s.trials);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);

  if (trials.length === 0) {
    return (
      <div {...stylex.props(styles.empty)}>
        <span {...stylex.props(styles.emptyIcon)}>
          <Icon name="graphic_eq" size={32} />
        </span>
        <span>no trials yet</span>
        <span>
          hold the mic button or Space to start a trial
        </span>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.timeline)}>
      {trials.map((t) => {
        const archived = false;
        const isLive = t.id === liveTrialId;
        return (
          <div
            key={t.id}
            data-trial-id={t.id}
            data-live={isLive ? "true" : undefined}
            ref={(el) => {
              if (isLive && el) {
                el.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }}
          >
            <TrialCard trial={t} archived={archived} />
          </div>
        );
      })}
    </div>
  );
}
