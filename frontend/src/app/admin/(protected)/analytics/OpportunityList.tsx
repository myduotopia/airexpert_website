import Link from "next/link";
import type { Opportunity } from "@/lib/analytics/types";

/** 優化機會：曝光高但 CTR 低的著陸頁，按鈕連往 SEO 總覽並預填搜尋。 */
export function OpportunityList({ items }: { items: Opportunity[] }) {
  if (items.length === 0) {
    return (
      <p className="text-text-muted text-[13px]">
        目前沒有「曝光高但點擊率低」的頁面 — 很好，代表標題與描述吸引到點擊。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((o) => (
        <li
          key={o.page}
          className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0">
            <p className="text-ink truncate text-[14px]" title={o.page}>
              {o.page}
            </p>
            <p className="text-text-muted text-[12px]">
              曝光 {o.impressions.toLocaleString("zh-TW")}、點擊 {o.clicks}、
              CTR {(o.ctr * 100).toFixed(1)}%、平均排名 {o.position.toFixed(1)}
            </p>
          </div>
          {o.slug ? (
            <Link
              href={`/admin/seo?q=${encodeURIComponent(o.slug)}`}
              className="border-primary text-primary-deep hover:bg-primary/5 shrink-0 rounded-lg border px-3 py-1.5 text-[13px]"
            >
              改 SEO →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
