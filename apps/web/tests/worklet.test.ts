import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("acknowledges stop after the final posted frame and emits no later audio", () => {
  let Processor: any;
  const postMessage = vi.fn();
  runInNewContext(readFileSync("public/recorder-worklet.js", "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage, onmessage: null }; },
    registerProcessor: (_name: string, constructor: unknown) => { Processor = constructor; },
  });
  const processor = new Processor();
  const input = new Float32Array([0.1, 0.2]);
  processor.process([[input]]);
  processor.port.onmessage({ data: "stop" });
  processor.process([[input]]);
  expect(postMessage.mock.calls).toHaveLength(2);
  expect(postMessage.mock.calls[0][0]).toEqual(input);
  expect(postMessage.mock.calls[0][0]).not.toBe(input);
  expect(postMessage.mock.calls[1][0]).toBe("stopped");
});
