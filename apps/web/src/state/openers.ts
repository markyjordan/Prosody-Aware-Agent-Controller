export const AGENT_OPENERS = [
  "I found the failing test. Should I fix the implementation or update the expected behavior?",
  "The refactor is ready. Would you like me to walk through the changes?",
  "There are two ways to handle this: a small patch or a broader cleanup. Which would you prefer?",
  "I can extract this duplicated logic into a shared helper. Shall I go ahead?",
  "The API change will affect two callers. Should I update both?",
  "The tests pass locally. Would you like me to prepare a commit?",
] as const;

// Independent sampling with replacement: consecutive openers may be identical.
export function randomOpener(): string {
  return AGENT_OPENERS[Math.floor(Math.random() * AGENT_OPENERS.length)];
}
