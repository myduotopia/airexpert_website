import { CoverImage } from "@/components/CoverImage";
import Link from "next/link";
import type { NewsCardProps } from "@/components/NewsCard";
import type { HomeNews } from "@/lib/data/home";
import { RailSection } from "@/components/home/RailSection";

// 最新消息 — 白底橫向 rail。標題來自 site_settings `home_news`；卡片來自已發佈文章
// （page.tsx 映射）。無文章時退回精簡提示，優雅降級。
function NewsRailCard({ item }: { item: NewsCardProps }) {
  return (
    <Link
      href={item.href}
      className="group border-border bg-surface hover:border-primary flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border transition-colors sm:w-[360px]"
    >
      <div className="bg-surface-muted relative h-[200px] w-full overflow-hidden">
        {item.image ? (
          <CoverImage
            src={item.image}
            alt={item.title}
            sizes="360px"
            className="transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5 text-[12px]">
          <span className="text-primary-deep font-semibold">
            {item.category}
          </span>
          <span className="text-border">·</span>
          <span className="text-text-muted font-mono">{item.date}</span>
        </div>
        <h3 className="text-ink line-clamp-2 text-[18px] leading-[1.4] font-semibold">
          {item.title}
        </h3>
      </div>
    </Link>
  );
}

export function NewsTeaser({
  content,
  items,
}: {
  content: HomeNews;
  items: NewsCardProps[];
}) {
  if (items.length === 0) {
    return (
      <section className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-16 md:px-20 md:py-[72px]">
          <div className="flex flex-col gap-2.5">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
              {content.eyebrow}
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              {content.title}
            </h2>
          </div>
          <p className="text-text-muted text-[15px]">
            最新消息即將上線，敬請期待。
          </p>
        </div>
      </section>
    );
  }

  return (
    <RailSection
      eyebrow={content.eyebrow}
      title={content.title}
      variant="light"
      bordered
    >
      {items.map((item) => (
        <NewsRailCard key={item.title} item={item} />
      ))}
    </RailSection>
  );
}
