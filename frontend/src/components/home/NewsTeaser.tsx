import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NewsCard, type NewsCardProps } from "@/components/NewsCard";

// Section 7 — NewsTeaser (bg white). 3-up news card grid → 1-up on mobile.
// Static for MVP; replace NEWS with data from @/lib/data (#8) later.
const NEWS: NewsCardProps[] = [
  {
    date: "2026.05.18",
    category: "永續報告",
    title: "邁向淨零：壓縮空氣節能白皮書",
    excerpt: "導入 ISO 50001 與智慧監控，平均降低 35% 壓縮空氣能耗。",
    href: "/news",
  },
  {
    date: "2026.04.30",
    category: "技術專文",
    title: "熱回收系統：把壓縮熱變成可用能源",
    excerpt: "透過熱交換回收壓縮過程廢熱，提升整廠能源效率。",
    href: "/news",
  },
  {
    date: "2026.04.12",
    category: "企業動態",
    title: "超勁賀獲頒能源管理績優企業",
    excerpt: "以系統化能源管理與減碳成效，獲產業永續肯定。",
    href: "/news",
  },
];

export function NewsTeaser() {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 py-20 md:px-20">
        {/* Head row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px]">
              NEWS · 最新消息
            </p>
            <h2 className="text-ink text-[28px] leading-tight font-bold md:text-[34px]">
              永續動態與技術觀點
            </h2>
          </div>
          <Link
            href="/news"
            className="text-primary-deep inline-flex items-center gap-1 text-[14px] font-semibold transition-opacity hover:opacity-80"
          >
            查看全部
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* News cards */}
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {NEWS.map((item) => (
            <NewsCard key={item.title} {...item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
