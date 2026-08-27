import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import { Icon } from "./Icon";

const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 20px",
    borderBottom: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surface,
    "@media (max-width: 640px)": {
      padding: "10px 14px",
      gap: 8,
    },
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: tokens.textSecondary,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
    "@media (max-width: 640px)": {
      gap: 8,
    },
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textPrimary,
    flexShrink: 0,
  },
  iconButtonHover: {
    ":hover": { borderColor: tokens.accent, color: tokens.accent },
  },
});

export function Header() {
  const theme = useSessionStore((s) => s.theme);
  const toggleTheme = useSessionStore((s) => s.toggleTheme);

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.title)}>
        Prosody-Aware Agent Controller
      </div>
      <div {...stylex.props(styles.right)}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`switch to ${theme === "dark" ? "light" : "dark"} mode`}
          {...stylex.props(styles.iconButton, styles.iconButtonHover)}
        >
          <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={18} />
        </button>
      </div>
    </header>
  );
}
