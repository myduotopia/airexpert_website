import type { DailyPoint } from "@/lib/analytics/types";

/** 把 YYYY-MM-DD 轉為 M/D（x 軸標籤用）。 */
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : ymd;
}

/** 取「漂亮」的 y 軸上限（1/2/2.5/5/10 × 10^n），讓刻度是整數好讀。 */
function niceMax(m: number): number {
  if (m <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(m));
  for (const s of [1, 2, 2.5, 5, 10]) {
    if (m <= s * pow) return s * pow;
  }
  return 10 * pow;
}

/**
 * 手寫 SVG 折線：本期（實線）vs 上期（灰虛線）。無外部套件。
 * 含 y 軸（使用者數，附水平格線）與 x 軸（日期）刻度標示。
 */
export function LineChart({ points }: { points: DailyPoint[] }) {
  if (points.length === 0) {
    return <p className="text-text-muted text-[13px]">此區間無資料。</p>;
  }

  // 版面：左側留給 y 軸數字、底部留給 x 軸日期。
  const W = 640,
    H = 210,
    PL = 40, // 左內距（y 軸標籤）
    PR = 14, // 右內距
    PT = 10, // 上內距
    PB = 24; // 下內距（x 軸標籤）
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const cur = points.map((p) => p.current);
  const prev = points.map((p) => p.previous ?? 0);
  const yMax = niceMax(Math.max(1, ...cur, ...prev));

  const x = (i: number) => PL + (i * plotW) / Math.max(1, points.length - 1);
  const y = (v: number) => PT + plotH - (v * plotH) / yMax;
  const path = (arr: number[]) =>
    arr
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join(" ");

  // y 軸三格刻度：0、一半、上限。
  const yTicks = [0, yMax / 2, yMax];
  // x 軸三個日期：起、中、迄（點數少時自動去重）。
  const xIdx = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
  );

  return (
    <div>
      <div className="text-text-muted mb-1 flex items-center gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-primary inline-block h-0.5 w-4 rounded" />
          本期
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-300" />
          上期
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[210px] w-full"
        role="img"
        aria-label={`每日使用者趨勢：${shortDate(points[0].date)} 至 ${shortDate(points[points.length - 1].date)}，最高約 ${yMax.toLocaleString("zh-TW")} 人`}
      >
        {/* y 軸格線與數字 */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PL}
              y1={y(t)}
              x2={W - PR}
              y2={y(t)}
              stroke="#eef2f6"
              strokeWidth={1}
            />
            <text
              x={PL - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#94a3b8"
              fontSize={11}
            >
              {Math.round(t).toLocaleString("zh-TW")}
            </text>
          </g>
        ))}

        {/* x 軸日期 */}
        {xIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 7}
            textAnchor={
              i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
            }
            fill="#94a3b8"
            fontSize={11}
          >
            {shortDate(points[i].date)}
          </text>
        ))}

        {/* 上期（灰虛線）與本期（實線） */}
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
    </div>
  );
}
