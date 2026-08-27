import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  icon: {
    fontFamily: '"Material Symbols Rounded"',
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 1,
    letterSpacing: "normal",
    textTransform: "none",
    display: "inline-block",
    whiteSpace: "nowrap",
    wordWrap: "normal",
    direction: "ltr",
    fontVariationSettings:
      "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
    userSelect: "none",
  },
});

export function Icon({
  name,
  size = 20,
  fill = false,
}: {
  name: string;
  size?: number;
  fill?: boolean;
}) {
  return (
    <span
      aria-hidden={true}
      {...stylex.props(styles.icon)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        overflow: "hidden",
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      }}
    >
      {name}
    </span>
  );
}
