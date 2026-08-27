import { useSessionStore } from "../state/store";
import type { Branch, Prosody } from "../protocol";

const controllers = new Map<Branch, AbortController>();

export function cancelBranch(branch: Branch) {
  controllers.get(branch)?.abort();
  controllers.delete(branch);
}

export function cancelAllBranches() {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
}

async function streamCondition(
  branch: Branch,
  body: unknown,
  onDelta: (text: string) => void,
): Promise<string> {
  const controller = new AbortController();
  controllers.set(branch, controller);
  useSessionStore.getState().setBranchStream(branch, "streaming");

  let acc = "";
  try {
    const res = await fetch(`/api/condition/${branch}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const evt = JSON.parse(line.slice(6)) as
          | { type: "delta"; text: string }
          | { type: "done" }
          | { type: "error"; message: string };
        if (evt.type === "delta") {
          acc += evt.text;
          onDelta(evt.text);
        } else if (evt.type === "error") {
          throw new Error(evt.message);
        }
      }
    }
    useSessionStore.getState().setBranchStream(branch, "idle");
    return acc;
  } catch (err) {
    const msg =
      err instanceof DOMException && err.name === "AbortError"
        ? "cancelled"
        : err instanceof Error
          ? err.message
          : String(err);
    useSessionStore.getState().setBranchStream(branch, "error", msg);
    throw err;
  } finally {
    controllers.delete(branch);
  }
}

async function runBoth(
  transcript: string,
  prosody?: Prosody,
): Promise<[string, string]> {
  const s = useSessionStore.getState();
  const hist = s.history;
  const scenario = s.scenario;

  const userA = { id: crypto.randomUUID(), role: "user" as const, content: transcript };
  const userB = { id: crypto.randomUUID(), role: "user" as const, content: transcript };

  let aText = "";
  let bText = "";

  const results = await Promise.allSettled([
    streamCondition(
      "baseline",
      { history: hist.concat(userA), turn: { transcript }, scenario },
      (t) => {
        aText += t;
        useSessionStore.getState().appendDelta("baseline", t);
      },
    ),
    streamCondition(
      "prosodic",
      { history: hist.concat(userB), turn: { transcript, prosody }, scenario },
      (t) => {
        bText += t;
        useSessionStore.getState().appendDelta("prosodic", t);
      },
    ),
  ]);

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      useSessionStore.getState().completeBranch(i === 0 ? "baseline" : "prosodic");
    } else {
      const reason = r.reason;
      const msgText =
        reason instanceof DOMException && reason.name === "AbortError"
          ? undefined
          : reason instanceof Error
            ? reason.message
            : String(reason);
      if (msgText) useSessionStore.getState().failActive(msgText);
    }
  });

  if (results.every((r) => r.status === "fulfilled")) {
    useSessionStore.getState().commitTurn(
      transcript,
      aText.trim(),
      bText.trim(),
      prosody,
    );
  }
  return [aText, bText];
}

export async function dispatchTurn(transcript: string, prosody?: Prosody) {
  await runBoth(transcript, prosody);
}

/**
 * Edit-and-resend: re-fans-out both conditions with the corrected transcript.
 * v1 scope: only the newest user message is editable.
 */
export async function resendLatestEdit(newContent: string) {
  const s = useSessionStore.getState();
  const trimmedContent = newContent.trim();
  if (!trimmedContent) return;

  let history = s.history;

  const trimToLastUser = (arr: typeof history) => {
    const out = [...arr];
    while (out.length > 0 && out[out.length - 1].role !== "user") out.pop();
    out.pop();
    return out;
  };

  history = trimToLastUser(history);

  useSessionStore.setState({ history });
  useSessionStore.getState().resetLiveTrialForResend();
  const st = useSessionStore.getState();
  st.beginTrial();
  await runBoth(trimmedContent, st.lastProsody);
}

/** Re-run the newest exchange without modifying any transcript. */
export async function regenerateLast() {
  const s = useSessionStore.getState();
  let lastUser = "";
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (s.history[i].role === "user") {
      lastUser = s.history[i].content;
      break;
    }
  }
  if (!lastUser) return;

  const trimAfterLastUser = (arr: typeof s.history) => {
    const out = [...arr];
    while (out.length > 0 && out[out.length - 1].role !== "user") out.pop();
    return out.slice(0, -1);
  };

  useSessionStore.setState({
    history: trimAfterLastUser(s.history),
  });
  useSessionStore.getState().resetLiveTrialForResend();

  await runBoth(lastUser, s.lastProsody);
}
