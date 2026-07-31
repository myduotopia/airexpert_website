import type { NamedRow } from "@/lib/analytics/types";

/** 橫條列：依最大值等比。用於流量來源、裝置分布。 */
export function BarList({ rows }: { rows: NamedRow[] }) {
  if (rows.length === 0) {
    return <p className="text-text-muted text-[13px]">此區間無資料。</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span
            className="text-ink w-40 shrink-0 truncate text-[13px]"
            title={r.label}
          >
            {r.label}
          </span>
          <span className="bg-surface-muted relative h-5 flex-1 overflow-hidden rounded">
            <span
              className="bg-primary/70 absolute inset-y-0 left-0 rounded"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="text-text-muted w-14 shrink-0 text-right text-[13px]">
            {r.value.toLocaleString("zh-TW")}
          </span>
        </li>
      ))}
    </ul>
  );
}
