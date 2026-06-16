import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { Article } from "@/lib/types";
import { HOME_COLORS } from "@/components/home/tokens";
import { formatNewsDate } from "./format";

// 文章卡片，對應設計稿 DB2 News Card（node AzEGv）：
// 封面圖 → 分類 Tag + 等寬日期 → 標題 → 摘要 → 「閱讀全文 →」。
// 整張卡可點擊，導向 /news/[slug]。
export function ArticleCard({ article }: { article: Article }) {
  const href = `/news/${article.slug}`;
  return (
    <li className="border-border bg-surface flex flex-col overflow-hidden rounded-[14px] border">
      <Link href={href} className="group flex h-full flex-col">
        <div className="bg-surface-muted relative aspect-[380/210] w-full overflow-hidden">
          {article.cover_image ? (
            <Image
              src={article.cover_image}
              alt={article.title}
              fill
              sizes="(max-width: 768px) 100vw, 380px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: HOME_COLORS.chipMint }}
              aria-hidden="true"
            >
              <ImageIcon className="text-primary/40 h-8 w-8" />
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-[22px]">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center rounded-[6px] px-2.5 py-1 text-[11px] font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {article.category}
            </span>
            <span className="text-text-muted font-mono text-[11px]">
              {formatNewsDate(article.published_at)}
            </span>
          </div>

          <h3 className="text-ink group-hover:text-primary-deep text-[17px] leading-[1.4] font-semibold transition-colors">
            {article.title}
          </h3>

          {article.excerpt ? (
            <p className="text-text-muted text-[13px] leading-[1.6]">
              {article.excerpt}
            </p>
          ) : null}

          <span className="text-primary-deep mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold">
            閱讀全文
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}
