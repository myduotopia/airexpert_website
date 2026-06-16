// Home-page-only color literals that are NOT part of the global Tailwind theme
// (globals.css @theme) and must not be added there per issue scope. Centralized
// here so each value is written exactly once (no duplicated hex across files).
//
// - chipMint: soft mint fill for icon chips and the "live" data pill (spec #E3F1E8).
// - logoMuted: muted-green partner wordmark color (spec #C3D6C8), also the
//   resting fill of the descending carbon-chart bars.
import {
  Wind,
  Gauge,
  Fan,
  Droplets,
  Ruler,
  BadgeCheck,
  LineChart,
  type LucideIcon,
} from "lucide-react";

export const HOME_COLORS = {
  chipMint: "#e3f1e8",
  logoMuted: "#c3d6c8",
} as const;

// DB 內容以字串指定 lucide 圖示名；此 map 把名稱解析成元件。
// 未知名稱由 resolveIcon 退回 ICON_FALLBACK。
export const ICON_MAP: Record<string, LucideIcon> = {
  wind: Wind,
  gauge: Gauge,
  fan: Fan,
  droplets: Droplets,
  ruler: Ruler,
  "badge-check": BadgeCheck,
  "line-chart": LineChart,
};

export const ICON_FALLBACK: LucideIcon = Wind;

export function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? ICON_FALLBACK;
}
