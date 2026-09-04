import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return {
    container,
    rerender: async (next: ReactNode) => { await act(async () => root.render(next)); },
    unmount: async () => { await act(async () => root.unmount()); container.remove(); },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
