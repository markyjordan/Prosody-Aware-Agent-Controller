import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ babel: { plugins: [["@stylexjs/babel-plugin", {
    dev: true,
    runtimeInjection: false,
    unstable_moduleResolution: { type: "commonJS" },
  }]] } })],
  define: { "import.meta.env.VITE_USE_MOCK": JSON.stringify("0") },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
  },
});
