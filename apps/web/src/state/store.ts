import { create } from "zustand";
import { randomOpener } from "./openers";
import type { Branch, Prosody } from "../protocol";
import type { ThemeMode } from "../styles/tokens.stylex";

const THEME_KEY = "paac.theme";

function initialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {}
  return "dark";
}

export type ConnState = "disconnected" | "connecting" | "connected";
export type TrialStatus =
  | "listening"
  | "transcribing"
  | "responding"
  | "complete"
  | "error";
export type StreamStatus = "idle" | "streaming" | "error";

export interface BranchState {
  text: string;
  done: boolean;
  error?: string;
}

export interface Trial {
  id: string;
  readonly opener: string;
  partialText: string;
  text: string;
  prosody?: Prosody;
  profile?: Record<string, unknown>;
  ttsProfiles?: Partial<Record<Branch, Record<string, number>>>;
  status: TrialStatus;
  baseline: BranchState;
  prosodic: BranchState;
}

function newTrial(id: string, opener: string): Trial {
  return {
    id,
    opener,
    partialText: "",
    text: "",
    status: "listening",
    baseline: { text: "", done: false },
    prosodic: { text: "", done: false },
  };
}

interface SessionStore {
  conn: ConnState;
  sessionId: string | null;
  recording: boolean;
  starting: boolean;
  processing: boolean;
  ttsActive: boolean;
  pttMode: "hold" | "toggle";
  scenario: string;
  statusLine: string;
  theme: ThemeMode;
  trials: Trial[];
  pendingOpener: string;
  liveTrialId: string | null;
  inspectId: string | null;

  lastProsody?: Prosody;
  branchStreams: Record<Branch, { status: StreamStatus; error?: string }>;

  setConn: (c: ConnState) => void;
  setSessionId: (id: string | null) => void;
  setRecording: (r: boolean) => void;
  setStarting: (starting: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setTtsActive: (active: boolean) => void;
  setPttMode: (m: "hold" | "toggle") => void;
  setScenario: (s: string) => void;
  setStatusLine: (s: string) => void;
  toggleTheme: () => void;
  setBranchStream: (b: Branch, status: StreamStatus, error?: string) => void;
  beginTrial: (turnId?: string) => string;
  applyPartial: (turnId: string, text: string) => void;
  applyProsody: (turnId: string, p: Prosody) => void;
  finalize: (turnId: string, text: string, prosody?: Prosody) => void;
  appendDelta: (turnId: string, branch: Branch, text: string) => void;
  completeBranch: (turnId: string, branch: Branch) => void;
  failBranch: (turnId: string, branch: Branch, message: string) => void;
  applyProfile: (turnId: string, profile: Record<string, unknown>) => void;
  applyTtsProfile: (
    turnId: string,
    branch: Branch,
    profile: Record<string, number>,
  ) => void;
  failActive: (message: string) => void;
  inspect: (id: string | null) => void;
  resetLiveTrialForResend: () => void;
  clearTrials: () => void;
}

function mapLive(
  trials: Trial[],
  liveId: string | null,
  fn: (t: Trial) => Trial,
): Trial[] {
  if (!liveId) return trials;
  return trials.map((t) => (t.id === liveId ? fn(t) : t));
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  conn: "disconnected",
  sessionId: null,
  recording: false,
  starting: false,
  processing: false,
  ttsActive: false,
  pttMode: "hold",
  scenario: "uncertain-yes",
  statusLine: "",
  theme: initialTheme(),
  trials: [],
  pendingOpener: randomOpener(),
  liveTrialId: null,
  inspectId: null,

  branchStreams: {
    baseline: { status: "idle" },
    prosodic: { status: "idle" },
  },

  setConn: (conn) => set({ conn }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRecording: (recording) => set({ recording }),
  setStarting: (starting) => set({ starting }),
  setProcessing: (processing) => set({ processing }),
  setTtsActive: (ttsActive) => set({ ttsActive }),
  setPttMode: (pttMode) => set({ pttMode }),
  setScenario: (scenario) => set({ scenario }),
  setStatusLine: (statusLine) => set({ statusLine }),

  toggleTheme: () =>
    set((s) => {
      const theme: ThemeMode = s.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {}
      return { theme };
    }),

  setBranchStream: (branch, streamStatus, error) =>
    set((s) => ({
      branchStreams: {
        ...s.branchStreams,
        [branch]: { status: streamStatus, error },
      },
    })),

  beginTrial: (turnId) => {
    const current = get().liveTrialId;
    if (current) return current;
    const id = turnId ?? crypto.randomUUID();
    set((s) => ({
      trials: [...s.trials, newTrial(id, s.pendingOpener)],
      liveTrialId: id,
      inspectId: null,
    }));
    return id;
  },

  applyPartial: (turnId, text) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({
        ...t,
        partialText: text,
        status: "transcribing",
      })),
    })),

  applyProsody: (turnId, prosody) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({ ...t, prosody })),
    })),

  finalize: (turnId, text, prosody) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({
        ...t,
        text,
        prosody: prosody ?? t.prosody,
        partialText: "",
        status: "responding",
      })),
      lastProsody: prosody ?? s.lastProsody,
    })),

  appendDelta: (turnId, branch, text) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({
        ...t,
        [branch]: { text: t[branch].text + text, done: false },
      })),
    })),

  completeBranch: (turnId, branch) =>
    set((s) => {
      if (s.liveTrialId !== turnId) return s;
      const trials = mapLive(s.trials, turnId, (t) => ({
        ...t,
        [branch]: { ...t[branch], done: true },
      }));
      const live = trials.find((t) => t.id === turnId);
      if (live && live.baseline.done && live.prosodic.done) {
        return {
          trials: trials.map((t) =>
            t.id === live.id ? { ...t, status: "complete" as const } : t,
          ),
          liveTrialId: null,
          pendingOpener: randomOpener(),
        };
      }
      return { trials };
    }),

  failBranch: (turnId, branch, message) => {
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({
        ...t,
        [branch]: { ...t[branch], done: true, error: message },
      })),
    }));
    get().completeBranch(turnId, branch);
  },

  applyProfile: (turnId, profile) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({ ...t, profile })),
    })),

  applyTtsProfile: (turnId, branch, profile) =>
    set((s) => ({
      trials: mapLive(s.trials, turnId, (t) => ({
        ...t,
        ttsProfiles: { ...t.ttsProfiles, [branch]: profile },
      })),
    })),

  failActive: (message) =>
    set((s) => ({
      statusLine: message,
      trials: mapLive(s.trials, s.liveTrialId, (t) => ({
        ...t, status: "error" as const,
      })),
      liveTrialId: null,
      pendingOpener: s.liveTrialId ? randomOpener() : s.pendingOpener,
    })),

  inspect: (inspectId) => set({ inspectId }),

  resetLiveTrialForResend: () =>
    set((s) => ({
      pendingOpener: s.trials.find((t) => t.id === s.liveTrialId)?.opener ?? s.pendingOpener,
      trials: s.trials.filter((t) => t.id !== s.liveTrialId),
      liveTrialId: null,
      inspectId: null,
    })),

  clearTrials: () => {
    const s = get();
    if (s.starting || s.recording || s.processing || s.liveTrialId || s.ttsActive) return;
    set({
      pendingOpener: randomOpener(),
      trials: [],
      liveTrialId: null,
      inspectId: null,
      statusLine: "",
      ttsActive: false,
      branchStreams: {
        baseline: { status: "idle" },
        prosodic: { status: "idle" },
      },
    });
  },
}));
