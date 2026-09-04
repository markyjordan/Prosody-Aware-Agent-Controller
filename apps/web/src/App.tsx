import * as stylex from "@stylexjs/stylex";
import { tokens, lightTheme, WAVE_COLORS } from "./styles/tokens.stylex";
import { useSessionStore } from "./state/store";
import { ClearButton } from "./components/ClearButton";
import { Header } from "./components/Header";
import { MicButton } from "./components/MicButton";
// import { ScenarioSelect } from "./components/ScenarioSelect";
// import { SimulateButton } from "./components/SimulateButton";
import { TrialStage } from "./components/TrialStage";
import { RealtimeWaveform } from "./components/RealtimeWaveform";
import { useRecorder } from "./hooks/useRecorder";
import { useSession } from "./hooks/useSession";
import { session } from "./session/session";
import type { ConnState, TrialStatus } from "./state/store";

const styles = stylex.create({
  root: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: tokens.bg,
    color: tokens.textPrimary,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  stage: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: "8px 16px",
  },
  composer: {
    borderTop: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surface,
    padding: "10px 20px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    "@media (max-width: 640px)": {
      padding: "8px 12px 10px",
    },
  },
  composerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 12,
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    "@media (max-width: 640px)": {
      gap: 8,
    },
  },
  status: {
    fontSize: 12,
    color: tokens.textMuted,
    textAlign: "center",
    minHeight: 16,
    overflowWrap: "anywhere",
    padding: "0 8px",
  },
  statusError: {
    color: tokens.recording,
    fontWeight: 600,
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
});

const DOT_COLOR: Record<ConnState, string> = {
  connected: tokens.ok,
  connecting: tokens.warn,
  disconnected: tokens.recording,
};

const CONN_LABEL: Record<ConnState, string> = {
  connected: "connected",
  connecting: "connecting…",
  disconnected: "offline",
};

function statusText(
  conn: ConnState,
  turnStatus: TrialStatus | null,
  mode: "hold" | "toggle",
): string {
  if (conn === "disconnected") return "disconnected — retrying…";
  if (conn === "connecting") return "connecting…";
  switch (turnStatus) {
    case "listening":
      return "listening…";
    case "transcribing":
      return "transcribing…";
    case "responding":
      return "responding (A/B)…";
    case "error":
      return "error";
    default:
      return mode === "hold"
        ? "hold the mic — or Space — and speak"
        : "click the mic — or press Space — to start and stop";
  }
}

export default function App() {
  const recorder = useRecorder({
    onChunk: (base64Pcm16) => session.sendAudio(base64Pcm16),
  });
  const { conn, statusLine } = useSession();

  const trials = useSessionStore((s) => s.trials);
  const liveTrialId = useSessionStore((s) => s.liveTrialId);
  const liveTrial = liveTrialId
    ? trials.find((t) => t.id === liveTrialId)
    : undefined;
  const turnStatus =
    liveTrial && liveTrial.status !== "complete" ? liveTrial.status : null;
  const recording = useSessionStore((s) => s.recording);
  const starting = useSessionStore((s) => s.starting);
  const processing = useSessionStore((s) => s.processing);
  const sessionId = useSessionStore((s) => s.sessionId);
  const pttMode = useSessionStore((s) => s.pttMode);
  const theme = useSessionStore((s) => s.theme);

  const line =
    statusLine ||
    (starting ? (pttMode === "hold"
      ? "requesting microphone… release to cancel"
      : "requesting microphone… click the mic to cancel") :
      conn === "connected" && !sessionId ? "waiting for audio session…" :
      processing && !turnStatus ? "finishing response…" :
      statusText(conn, recording ? "listening" : turnStatus, pttMode));
  const isError = statusLine.startsWith("error:");

  return (
    <div
      {...stylex.props(styles.root, theme === "light" ? lightTheme : null)}
    >
      <Header />
      <main {...stylex.props(styles.stage)}>
        <TrialStage />
      </main>
      <footer {...stylex.props(styles.composer)}>
        <div {...stylex.props(styles.composerRow)}>
          {/* Simulation entry points retained for future development:
          <SimulateButton />
          <ScenarioSelect />
          */}
          <MicButton recorder={recorder} />
          <RealtimeWaveform recorder={recorder} colors={WAVE_COLORS[theme]} />
          <ClearButton />
        </div>
        <div {...stylex.props(styles.statusRow)}>
          <span
            {...stylex.props(styles.statusDot)}
            style={{ backgroundColor: DOT_COLOR[conn] }}
            title={CONN_LABEL[conn]}
          />
          <div
            {...stylex.props(
              styles.status,
              isError ? styles.statusError : null,
            )}
          >
            {line}
          </div>
        </div>
      </footer>
    </div>
  );
}
