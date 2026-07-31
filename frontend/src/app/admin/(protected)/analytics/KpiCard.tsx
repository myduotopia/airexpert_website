import { pctChange, formatPct } from "@/lib/analytics/format";
import type { Metric } from "@/lib/analytics/types";

/** 單張 KPI 卡：標題、主值、與上期比較。value 可為整數或已格式化字串。 */
export function KpiCard({
  label,
  metric,
  format = (n: number) => n.toLocaleString("zh-TW"),
}: {
  label: string;
  metric: Metric;
  format?: (n: number) => string;
}) {
  const ratio = pctChange(metric.value, metric.previous);
  const up = ratio !== null && ratio > 0;
  const down = ratio !== null && ratio < 0;
  return (
    <div className="border-border rounded-xl border bg-white p-4">
      <p className="text-text-muted text-[13px]">{label}</p>
      <p className="text-ink mt-1 text-[24px] font-bold">
        {format(metric.value)}
      </p>
      <p
        className={`mt-0.5 text-[12px] ${
          up ? "text-primary-deep" : down ? "text-red-600" : "text-text-muted"
        }`}
      >
        {formatPct(ratio)} <span className="text-text-muted">vs 上期</span>
      </p>
    </div>
  );
}
