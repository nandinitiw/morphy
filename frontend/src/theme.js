// Single source of truth for colors used from JS (Chart.js configs, chessboard
// squares). Mirrors the CSS custom properties in App.css — update both together.

export const THEME = {
  ink: "#2B2620",
  muted: "#5C5344",
  dim: "#8A8171",

  accent: "#C1793A", // ochre — brand accent
  accentHover: "#A6612B",
  accentSoft: "#F1E4CF",

  sage: "#4E6B41", // good / correct
  sageSoft: "#E8EEE0",
  terracotta: "#B5502F", // blunder / gap
  terracottaSoft: "#F5E3DA",

  aiViolet: "#5B3FA0", // AI only
  aiVioletSoft: "#EFEAFB",
  aiVioletLine: "#C9B8EA",

  surface: "#FFFDF8",
  border: "#E4DBC8",
  track: "#EFE6D3",

  // Board
  sqLight: "#EFE6D3",
  sqDark: "#A9754F",
  sqFrom: "#E0A98F",
  sqTarget: "#D9C98A",

  mono: "IBM Plex Mono",
};

// Chart.js axis/grid defaults for the warm light theme.
export const AXIS_TICK = { color: THEME.dim, font: { size: 11, family: THEME.mono } };
export const GRID = { color: "rgba(43,38,32,0.08)" };

export const boardSquareStyles = {
  customLightSquareStyle: { backgroundColor: THEME.sqLight },
  customDarkSquareStyle: { backgroundColor: THEME.sqDark },
};

/** Severity color ramp: sage (fine) → ochre (medium) → terracotta (bad). */
export function severityColor(cp) {
  if (cp >= 200) return THEME.terracotta;
  if (cp >= 130) return THEME.accent;
  return THEME.dim;
}
