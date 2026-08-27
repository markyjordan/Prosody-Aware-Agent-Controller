import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import { Icon } from "./Icon";

const styles = stylex.create({
  resetBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${tokens.border}`,
    backgroundColor: tokens.surfaceHover,
    color: tokens.textMuted,
  },
});

export function ModeToggle() {
  const resetContexts = useSessionStore((s) => s.resetContexts);

  return (
    <button
      type="button"
      title="reset both conversation contexts"
      aria-label="reset contexts"
      onClick={() => resetContexts()}
      {...stylex.props(styles.resetBtn)}
    >
      <Icon name="restart_alt" size={18} />
    </button>
  );
}
