// Home-page-only color literals that are NOT part of the global Tailwind theme
// (globals.css @theme) and must not be added there per issue scope. Centralized
// here so each value is written exactly once (no duplicated hex across files).
//
// - chipMint: soft mint fill for icon chips and the "live" data pill (spec #E3F1E8).
// - logoMuted: muted-green partner wordmark color (spec #C3D6C8), also the
//   resting fill of the descending carbon-chart bars.
export const HOME_COLORS = {
  chipMint: "#e3f1e8",
  logoMuted: "#c3d6c8",
} as const;
