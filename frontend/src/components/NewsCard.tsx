import Link from "next/link";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { HOME_COLORS } from "@/components/home/tokens";

// Reusable news card.（category/date/title/excerpt/href）對應 Article。
// image 為文章封面（Article.cover_image）：有圖以 next/image 顯示，無圖退回佔位塊。
export type NewsCardProps = {
  category: string;
  date: string;
  title: string;
  excerpt: string;
  href: string;
  image?: string | null;
};

export function NewsCard({
  category,
  date,
  title,
  excerpt,
  href,
  image,
}: NewsCardProps) {
  return (
    <li className="border-border bg-surface flex flex-col overflow-hidden rounded-[14px] border">
      <Link href={href} className="group flex h-full flex-col">
        {/* 封面（16:9）：有圖顯示文章封面，無圖退回佔位塊。 */}
        {image ? (
          <div className="relative aspect-video overflow-hidden">
            <Image
              src={image}
              alt={title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        ) : (
          <div
            className="flex aspect-video items-center justify-center"
            style={{ backgroundColor: HOME_COLORS.chipMint }}
            aria-hidden="true"
          >
            <ImageIcon className="text-primary/40 h-8 w-8" />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2 p-5">
          <div className="flex items-center gap-3">
            <span className="text-primary-deep text-[14px] font-semibold">
              {category}
            </span>
            <span className="text-text-muted font-mono text-[14px]">
              {date}
            </span>
          </div>
          <h3 className="text-ink group-hover:text-primary-deep text-[18px] leading-snug font-semibold transition-colors">
            {title}
          </h3>
          <p className="text-text-muted text-[15px] leading-[1.6]">{excerpt}</p>
        </div>
      </Link>
    </li>
  );
}
