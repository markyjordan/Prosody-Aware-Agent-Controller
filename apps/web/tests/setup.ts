import { afterEach, beforeEach, vi } from "vitest";
import { useSessionStore } from "../src/state/store";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState(), true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
