import type { CaseMetrics } from "@/lib/types";

export type MetricEntry = { key: string; value: string };

// metrics jsonb（開放鍵值對）→ 可渲染的 [{key, value}]。
// 略過空值；數字轉字串。維持物件插入順序，讓後台輸入的順序＝前台顯示順序。
export function metricsToEntries(metrics: CaseMetrics | null): MetricEntry[] {
  if (!metrics || typeof metrics !== "object") return [];
  return Object.entries(metrics)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([key, value]) => ({ key, value: String(value) }));
}
