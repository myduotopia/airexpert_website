"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { RANGE_DAYS } from "@/lib/analytics/ranges";

/** 7 / 30 / 90 天切換：改寫 ?range= 並導航（保留其他 param）。 */
export function RangeTabs({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const go = (days: number) => {
    const next = new URLSearchParams(params);
    next.set("range", String(days));
    router.push(`/admin/analytics?${next.toString()}`);
  };
  return (
    <div className="border-border inline-flex rounded-lg border bg-white p-0.5">
      {RANGE_DAYS.map((d) => (
        <button
          key={d}
          onClick={() => go(d)}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            current === d
              ? "bg-primary text-white"
              : "text-text-muted hover:text-ink"
          }`}
        >
          近 {d} 天
        </button>
      ))}
    </div>
  );
}
