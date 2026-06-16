import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { Article } from "@/lib/types";
import { HOME_COLORS } from "@/components/home/tokens";
import { formatNewsDate } from "./format";

// 主打文章大卡，對應設計稿 FeaturedBlock 內的 Featured（node A3Kjb）：
// 大封面（360 高）→ 分類 Tag + 日期 → 大標題 → 摘要 → 「閱讀全文」實心綠按鈕。
export function FeaturedArticle({ article }: { article: Article }) {
  const href = `/news/${article.slug}`;
  return (
    <article className="border-border bg-surface flex flex-col overflow-hidden rounded-[16px] border">
      <Link
        href={href}
        className="bg-surface-muted relative block aspect-[760/360] w-full overflow-hidden"
      >
        {article.cover_image ? (
          <Image
            src={article.cover_image}
            alt={article.title}
            fill
            sizes="(max-width: 1024px) 100vw, 760px"
            priority
            className="object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: HOME_COLORS.chipMint }}
            aria-hidden="true"
          >
            <ImageIcon className="text-primary/40 h-10 w-10" />
          </span>
        )}
      </Link>

      <div className="flex flex-col gap-3.5 p-7">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex items-center rounded-[6px] px-3 py-1.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {article.category}
          </span>
          <span className="text-text-muted font-mono text-[12px]">
            {formatNewsDate(article.published_at)}
          </span>
        </div>

        <h2 className="text-ink text-[28px] leading-[1.3] font-bold">
          <Link
            href={href}
            className="hover:text-primary-deep transition-colors"
          >
            {article.title}
          </Link>
        </h2>

        {article.excerpt ? (
          <p className="text-text-muted text-[15px] leading-[1.65]">
            {article.excerpt}
          </p>
        ) : null}

        <Link
          href={href}
          className="bg-primary hover:bg-primary-deep mt-1 inline-flex w-fit items-center gap-2 rounded-[24px] px-5 py-3 text-[14px] font-semibold text-white transition-colors"
        >
          閱讀全文
          <ArrowRight className="h-[15px] w-[15px]" />
        </Link>
      </div>
    </article>
  );
}
