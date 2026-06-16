import Link from "next/link";
import Image from "next/image";
import { Sparkles, ImageIcon } from "lucide-react";
import type { Article } from "@/lib/types";
import { HOME_COLORS } from "@/components/home/tokens";
import { formatNewsDate } from "./format";

// 「編輯推薦」側欄，對應設計稿 Sidebar（node RPBbA）：標題列 + 縮圖清單。
// 取最新文章（排除主打那篇）填入。
export function EditorPicks({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  return (
    <aside className="border-border bg-surface-muted flex flex-col overflow-hidden rounded-[16px] border">
      <div className="border-border flex items-center gap-2 border-b px-[22px] py-5">
        <Sparkles className="text-primary-deep h-4 w-4" />
        <span className="text-ink text-[15px] font-bold">編輯推薦</span>
      </div>

      <ul>
        {articles.map((a, i) => (
          <li
            key={a.id}
            className={`border-border ${i < articles.length - 1 ? "border-b" : ""}`}
          >
            <Link
              href={`/news/${a.slug}`}
              className="group flex items-center gap-3.5 p-[18px]"
            >
              <span className="bg-surface relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px]">
                {a.cover_image ? (
                  <Image
                    src={a.cover_image}
                    alt={a.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center"
                    style={{ backgroundColor: HOME_COLORS.chipMint }}
                    aria-hidden="true"
                  >
                    <ImageIcon className="text-primary/40 h-5 w-5" />
                  </span>
                )}
              </span>
              <span className="flex flex-col gap-1.5">
                <span className="text-text-muted font-mono text-[11px]">
                  {formatNewsDate(a.published_at)}
                </span>
                <span className="text-ink group-hover:text-primary-deep text-[14px] leading-[1.4] font-semibold transition-colors">
                  {a.title}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
