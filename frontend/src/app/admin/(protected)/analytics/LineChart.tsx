import type { DailyPoint } from "@/lib/analytics/types";

/** 手寫 SVG 折線：本期（實線）vs 上期（灰虛線）。無外部套件。 */
export function LineChart({ points }: { points: DailyPoint[] }) {
  const W = 640,
    H = 180,
    P = 8;
  if (points.length === 0) {
    return <p className="text-text-muted text-[13px]">此區間無資料。</p>;
  }
  const cur = points.map((p) => p.current);
  const prev = points.map((p) => p.previous ?? 0);
  const max = Math.max(1, ...cur, ...prev);
  const x = (i: number) =>
    P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const path = (arr: number[]) =>
    arr
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[180px] w-full"
      role="img"
      aria-label="每日使用者趨勢"
    >
      <path
        d={path(prev)}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <path
        d={path(cur)}
        fill="none"
        stroke="var(--color-primary, #2f855a)"
        strokeWidth={2}
      />
    </svg>
  );
}
