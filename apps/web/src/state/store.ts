import { create } from "zustand";
import type { Branch, ChatMsg, Prosody } from "../protocol";
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
}

export interface Trial {
  id: string;
  partialText: string;
  text: string;
  prosody?: Prosody;
  status: TrialStatus;
  baseline: BranchState;
  prosodic: BranchState;
}

function newTrial(id: string): Trial {
  return {
    id,
    partialText: "",
    text: "",
    status: "listening",
    baseline: { text: "", done: false },
    prosodic: { text: "", done: false },
  };
}

function msg(role: ChatMsg["role"], content: string): ChatMsg {
  return { id: crypto.randomUUID(), role, content };
}

interface SessionStore {
  conn: ConnState;
  recording: boolean;
  pttMode: "hold" | "toggle";
  scenario: string;
  statusLine: string;
  theme: ThemeMode;
  trials: Trial[];
  liveTrialId: string | null;
  inspectId: string | null;

  history: ChatMsg[];
  lastProsody?: Prosody;
  shownToUser: ("baseline" | "prosodic")[];
  branchStreams: Record<Branch, { status: StreamStatus; error?: string }>;

  setConn: (c: ConnState) => void;
  setRecording: (r: boolean) => void;
  setPttMode: (m: "hold" | "toggle") => void;
  setScenario: (s: string) => void;
  setStatusLine: (s: string) => void;
  toggleTheme: () => void;
  setBranchStream: (b: Branch, status: StreamStatus, error?: string) => void;
  beginTrial: () => void;
  applyPartial: (text: string) => void;
  applyProsody: (p: Prosody) => void;
  finalize: (text: string, prosody: Prosody) => void;
  appendDelta: (branch: Branch, text: string) => void;
  completeBranch: (branch: Branch) => void;
  failActive: (message: string) => void;
  inspect: (id: string | null) => void;
  commitTurn: (
    transcript: string,
    aText: string,
    bText: string,
    prosody?: Prosody,
  ) => void;
  resetLiveTrialForResend: () => void;
  resetContexts: () => void;
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
  recording: false,
  pttMode: "hold",
  scenario: "uncertain-yes",
  statusLine: "",
  theme: initialTheme(),
  trials: [],
  liveTrialId: null,
  inspectId: null,

  history: [],
  shownToUser: [],
  branchStreams: {
    baseline: { status: "idle" },
    prosodic: { status: "idle" },
  },

  setConn: (conn) => set({ conn }),
  setRecording: (recording) => set({ recording }),
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

  beginTrial: () =>
    set((s) => {
      if (s.liveTrialId) return {};
      const id = crypto.randomUUID();
      return {
        trials: [...s.trials, newTrial(id)],
        liveTrialId: id,
        inspectId: null,
      };
    }),

  applyPartial: (text) =>
    set((s) => ({
      trials: mapLive(s.trials, s.liveTrialId, (t) => ({
        ...t,
        partialText: text,
      })),
    })),

  applyProsody: (prosody) =>
    set((s) => ({
      trials: mapLive(s.trials, s.liveTrialId, (t) => ({ ...t, prosody })),
    })),

  finalize: (text, prosody) =>
    set((s) => ({
      trials: mapLive(s.trials, s.liveTrialId, (t) => ({
        ...t,
        text,
        prosody,
        partialText: "",
        status: "responding",
      })),
      lastProsody: prosody,
    })),

  appendDelta: (branch, text) =>
    set((s) => ({
      trials: mapLive(s.trials, s.liveTrialId, (t) => ({
        ...t,
        [branch]: { text: t[branch].text + text, done: false },
      })),
    })),

  completeBranch: (branch) =>
    set((s) => {
      const trials = mapLive(s.trials, s.liveTrialId, (t) => ({
        ...t,
        [branch]: { ...t[branch], done: true },
      }));
      const live = trials.find((t) => t.id === s.liveTrialId);
      let liveTrialId = s.liveTrialId;
      if (live && live.baseline.done && live.prosodic.done) {
        liveTrialId = null;
        return {
          trials: trials.map((t) =>
            t.id === live.id ? { ...t, status: "complete" as const } : t,
          ),
          liveTrialId,
        };
      }
      return { trials };
    }),

  failActive: (message) =>
    set((s) => {
      const trials = s.trials.filter((t) => {
        if (t.id !== s.liveTrialId) return true;
        return t.text !== "" || t.partialText !== "";
      });
      return {
        statusLine: message,
        trials: trials.map((t) =>
          t.id === s.liveTrialId ? { ...t, status: "error" as const } : t,
        ),
        liveTrialId: null,
      };
    }),

  inspect: (inspectId) => set({ inspectId }),

  commitTurn: (transcript, aText, bText, prosody) => {
    const s = get();
    const shown = aText || bText;
    const userMsg = msg("user", transcript);

    const history = [...s.history, userMsg, msg("assistant", shown)];

    set({
      history,
      shownToUser: [...s.shownToUser, "baseline"],
      lastProsody: prosody ?? s.lastProsody,
    });
    get().completeBranch("baseline");
    get().completeBranch("prosodic");
  },

  resetLiveTrialForResend: () =>
    set((s) => ({
      trials: s.trials.filter((t) => t.id !== s.liveTrialId),
      liveTrialId: null,
      inspectId: null,
    })),

  resetContexts: () => set({ history: [], shownToUser: [] }),
}));
