import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NewsCard, type NewsCardProps } from "@/components/NewsCard";
import type { HomeNews } from "@/lib/data/home";

// Section 7 — NewsTeaser (bg white). 3-up news card grid → 1-up on mobile.
// Heading from site_settings `home_news`; cards from published articles
// (page.tsx maps them). When there are no published articles the grid is
// omitted so the section degrades gracefully.
export function NewsTeaser({
  content,
  items,
}: {
  content: HomeNews;
  items: NewsCardProps[];
}) {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-6 py-20 md:px-20">
        {/* Head row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-primary-deep font-mono text-[14px] tracking-[1px]">
              {content.eyebrow}
            </p>
            <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[36px]">
              {content.title}
            </h2>
          </div>
          <Link
            href="/news"
            className="text-primary-deep inline-flex items-center gap-1 text-[16px] font-semibold transition-opacity hover:opacity-80"
          >
            查看全部
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* News cards */}
        {items.length > 0 ? (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {items.map((item) => (
              <NewsCard key={item.title} {...item} />
            ))}
          </ul>
        ) : (
          <p className="text-text-muted text-[15px]">
            最新消息即將上線，敬請期待。
          </p>
        )}
      </div>
    </section>
  );
}
