import { pctChange, formatPct } from "@/lib/analytics/format";
import type { Metric } from "@/lib/analytics/types";

/** 單張 KPI 卡：標題、主值、與上期比較。value 可為整數或已格式化字串。 */
export function KpiCard({
  label,
  metric,
  format = (n: number) => n.toLocaleString("zh-TW"),
  lowerIsBetter = false,
}: {
  label: string;
  metric: Metric;
  format?: (n: number) => string;
  /** 數值愈低愈好的指標（如平均排名）：好/壞配色反轉，百分比文字與正負號不變。 */
  lowerIsBetter?: boolean;
}) {
  const ratio = pctChange(metric.value, metric.previous);
  const isIncrease = ratio !== null && ratio > 0;
  const isDecrease = ratio !== null && ratio < 0;
  const good = lowerIsBetter ? isDecrease : isIncrease;
  const bad = lowerIsBetter ? isIncrease : isDecrease;
  return (
    <div className="border-border rounded-xl border bg-white p-4">
      <p className="text-text-muted text-[13px]">{label}</p>
      <p className="text-ink mt-1 text-[24px] font-bold">
        {format(metric.value)}
      </p>
      <p
        className={`mt-0.5 text-[12px] ${
          good ? "text-primary-deep" : bad ? "text-red-600" : "text-text-muted"
        }`}
      >
        {formatPct(ratio)} <span className="text-text-muted">vs 上期</span>
      </p>
    </div>
  );
}
