import * as stylex from "@stylexjs/stylex";

export const tokens = stylex.defineVars({
  bg: "#0b0e14",
  surface: "#12161f",
  surfaceHover: "#1a2030",
  border: "#232a3a",
  textPrimary: "#e6e9ef",
  textSecondary: "#9aa4b5",
  textMuted: "#6b7487",
  accent: "#5b8cff",
  accentSoft: "#5b8cff22",
  userBubble: "#1c2740",
  baselineTint: "#2a2f3a",
  prosodicTint: "#16283f",
  recording: "#ff5566",
  ok: "#3fd68c",
  warn: "#ffb454",
});

export const lightTheme = stylex.createTheme(tokens, {
  bg: "#f4f6fb",
  surface: "#ffffff",
  surfaceHover: "#eceff7",
  border: "#dce1ec",
  textPrimary: "#171c28",
  textSecondary: "#4e5a72",
  textMuted: "#8b95a9",
  accent: "#3b66f5",
  accentSoft: "#3b66f51a",
  userBubble: "#dde6fd",
  baselineTint: "#edeff5",
  prosodicTint: "#e2ecfd",
  recording: "#d9374a",
  ok: "#178a52",
  warn: "#a96a08",
});

export type ThemeMode = "dark" | "light";

export const WAVE_COLORS: Record<ThemeMode, { track: string; live: string; bg: string }> = {
  dark: { track: "#2a3040", live: "#5b8cff", bg: "#12161f" },
  light: { track: "#c8cfdd", live: "#3b66f5", bg: "#ffffff" },
};
