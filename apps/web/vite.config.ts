import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";

const useMock = process.env.USE_MOCK === "1";
const apiPort = process.env.API_PORT ?? 8000;
const mockPort = process.env.MOCK_PORT ?? 8787;

async function startMockServer() {
  if (!useMock || process.env.NO_MOCK === "1") return;
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
  define: { "import.meta.env.VITE_USE_MOCK": JSON.stringify(useMock ? "1" : "0") },
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
        target: "ws://localhost:" + (useMock ? mockPort : apiPort),
        ws: true,
      },
      "/api/tts": {
        target: "http://localhost:" + (process.env.TTS_PORT ?? apiPort),
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:" + (useMock ? mockPort : apiPort),
        changeOrigin: true,
      },
    },
  },
});
