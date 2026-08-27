import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useSessionStore } from "./state/store";
import "material-symbols/rounded.css";
import "./styles/global.css";

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useSessionStore;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
