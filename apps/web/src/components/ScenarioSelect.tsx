import * as stylex from "@stylexjs/stylex";
import { tokens } from "../styles/tokens.stylex";
import { useSessionStore } from "../state/store";
import { session } from "../session/session";

export const SCENARIOS = [
  { id: "uncertain-yes", label: 'uncertain "Sure."' },
  { id: "confident-yes", label: 'confident "Yeah, go ahead."' },
  { id: "hesitant-stop", label: 'hesitant "Stop... wait."' },
  { id: "sarcastic-frustration", label: 'sarcastic "Oh great."' },
] as const;

const styles = stylex.create({
  select: {
    backgroundColor: tokens.surfaceHover,
    color: tokens.textPrimary,
    border: `1px solid ${tokens.border}`,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    outline: "none",
    height: 44,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    "@media (max-width: 640px)": {
      fontSize: 11,
      height: 40,
      padding: "6px 12px",
    },
  },
});

export function ScenarioSelect() {
  const scenario = useSessionStore((s) => s.scenario);
  const setScenario = useSessionStore((s) => s.setScenario);

  return (
    <select
      {...stylex.props(styles.select)}
      value={scenario}
      onChange={(e) => {
        setScenario(e.target.value);
        session.reinit();
      }}
      title="mock scenario"
      aria-label="mock scenario"
    >
      {SCENARIOS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
