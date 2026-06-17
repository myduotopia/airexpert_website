import type { CaseMetrics } from "@/lib/types";
import { metricsToEntries } from "./metrics";

// 節能數據卡：把 metrics jsonb 以「卡片格」呈現（如 年省電度數 / 投資回收期）。
// 設計語言沿用 V3.08（淺底卡、主綠數字、次文字標籤）。無數據時不渲染。
export function MetricsCards({ metrics }: { metrics: CaseMetrics | null }) {
  const entries = metricsToEntries(metrics);
  if (entries.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {entries.map((m) => (
        <div
          key={m.key}
          className="border-border bg-surface-muted flex flex-col gap-1.5 rounded-[14px] border p-5"
        >
          <dt className="text-text-muted text-[13px]">{m.key}</dt>
          <dd className="text-primary-deep font-mono text-[24px] leading-[1.2] font-bold">
            {m.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
