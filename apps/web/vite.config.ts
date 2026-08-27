import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

async function startMockServer() {
  if (process.env.NO_MOCK) return;
  try {
    const { startServer } = await import("./mock/server.mjs");
    startServer(Number(process.env.MOCK_PORT ?? 8787));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.log("[mock] already running on :" + (process.env.MOCK_PORT ?? 8787));
    } else {
      throw err;
    }
  }
}

const mockPlugin = {
  name: "mock-server",
  configureServer() {
    void startMockServer();
  },
};

export default defineConfig({
  plugins: [
    stylex.vite({
      useCSSLayers: true,
      runtimeInjection: true,
      devMode: "css-only",
    }),
    react(),
    mockPlugin,
  ],
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:" + (process.env.MOCK_PORT ?? 8787),
        ws: true,
      },
      "/api": {
        target: "http://localhost:" + (process.env.MOCK_PORT ?? 8787),
        changeOrigin: true,
      },
    },
  },
});
