import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { AGENT_OPENERS, randomOpener } from "../src/state/openers";
import { useSessionStore as store } from "../src/state/store";
import { TrialStage } from "../src/components/TrialStage";
import { ClearButton } from "../src/components/ClearButton";
import { render } from "./render";

function complete(id: string) {
  store.getState().completeBranch(id, "baseline");
  store.getState().completeBranch(id, "prosodic");
}

describe("independent opener ownership", () => {
  it("samples every entry including both boundaries and allows repeats", () => {
    const random = vi.spyOn(Math, "random");
    AGENT_OPENERS.forEach((opener, i) => {
      random.mockReturnValue(i / AGENT_OPENERS.length);
      expect(randomOpener()).toBe(opener);
      expect(randomOpener()).toBe(opener);
    });
    random.mockReturnValue(0.999999);
    expect(randomOpener()).toBe(AGENT_OPENERS.at(-1));
  });

  it("captures the displayed opener and draws once after both branches finish", () => {
    const initial = store.getState().pendingOpener;
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    store.getState().beginTrial("one");
    expect(store.getState().trials[0].opener).toBe(initial);
    store.getState().completeBranch("one", "baseline");
    expect(random).not.toHaveBeenCalled();
    store.getState().completeBranch("one", "prosodic");
    expect(random).toHaveBeenCalledTimes(1);
    store.getState().beginTrial("two");
    complete("two");
    store.getState().beginTrial("three");
    expect(store.getState().trials.map((t) => t.opener)).toEqual([
      initial, AGENT_OPENERS[0], AGENT_OPENERS[0],
    ]);
    store.getState().completeBranch("one", "prosodic");
    expect(store.getState().liveTrialId).toBe("three");
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("keeps startup failures stable but preserves failed trials and draws their successor", () => {
    const initial = store.getState().pendingOpener;
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    store.getState().failActive("microphone denied");
    expect(random).not.toHaveBeenCalled();
    store.getState().beginTrial("failed");
    store.getState().failActive("connection lost");
    expect(store.getState().trials[0]).toMatchObject({ opener: initial, status: "error" });
    expect(random).toHaveBeenCalledTimes(1);
    store.getState().failActive("another session error");
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("finishes a branch error only once the other branch completes", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    store.getState().beginTrial("partial");
    store.getState().failBranch("partial", "baseline", "provider failed");
    expect(random).not.toHaveBeenCalled();
    store.getState().completeBranch("partial", "prosodic");
    expect(random).toHaveBeenCalledTimes(1);
  });

  it.each(["starting", "recording", "processing", "ttsActive"] as const)(
    "refuses Clear while %s", (field) => {
      const random = vi.spyOn(Math, "random");
      store.setState({ [field]: true });
      store.getState().clearTrials();
      expect(random).not.toHaveBeenCalled();
    },
  );

  it("Clear independently resamples even with no recorded trials", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    store.getState().clearTrials();
    store.getState().clearTrials();
    expect(random).toHaveBeenCalledTimes(2);
    expect(store.getState().pendingOpener).toBe(AGENT_OPENERS[0]);
    expect(store.getState().trials).toEqual([]);
  });

  it("renders the pending opener before recording and retains it with its trial", async () => {
    const initial = store.getState().pendingOpener;
    const view = await render(<><TrialStage /><ClearButton /></>);
    try {
      expect(view.container.textContent).toContain(initial);
      expect(view.container.querySelector("button")!.disabled).toBe(false);
      const random = vi.spyOn(Math, "random").mockReturnValue(0);
      await view.rerender(<><TrialStage /><ClearButton /></>);
      await act(async () => {
        store.getState().setConn("connected");
        store.getState().setSessionId("session");
        store.getState().beginTrial("one");
      });
      expect(random).not.toHaveBeenCalled();
      expect(view.container.querySelector("[data-trial-id='one']")!.textContent).toContain(initial);
      expect(view.container.querySelector("button")!.disabled).toBe(true);
      await act(async () => {
        store.getState().finalize("one", "Yes, go ahead.");
        store.getState().appendDelta("one", "baseline", "I will prepare the patch.");
        store.getState().appendDelta("one", "prosodic", "I will explain the patch first.");
        complete("one");
      });
      expect(view.container.textContent).toContain("Yes, go ahead.");
      expect(view.container.textContent).toContain("I will prepare the patch.");
      expect(view.container.textContent).toContain("I will explain the patch first.");
      expect(view.container.querySelectorAll('[aria-label="Agent opening message"]')).toHaveLength(2);
      await act(async () => view.container.querySelector<HTMLButtonElement>('[aria-label="clear all trials"]')!.click());
      expect(view.container.querySelectorAll("[data-trial-id]")).toHaveLength(0);
      expect(view.container.textContent).toContain(AGENT_OPENERS[0]);
    } finally { await view.unmount(); }
  });
});
