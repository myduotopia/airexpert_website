import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { HOME_COLORS } from "@/components/home/tokens";

// Reusable news card. Static props for MVP; the shape (category/date/title/
// excerpt/href) maps cleanly onto an Article from @/lib/data when wired later
// (#8). Cover is a placeholder block for now (TODO: add an image prop +
// next/image when real assets land in #8).
export type NewsCardProps = {
  category: string;
  date: string;
  title: string;
  excerpt: string;
  href: string;
};

export function NewsCard({
  category,
  date,
  title,
  excerpt,
  href,
}: NewsCardProps) {
  return (
    <li className="border-border bg-surface flex flex-col overflow-hidden rounded-[14px] border">
      <Link href={href} className="group flex h-full flex-col">
        {/* Cover image placeholder (16:9) */}
        <div
          className="flex aspect-video items-center justify-center"
          style={{ backgroundColor: HOME_COLORS.chipMint }}
          aria-hidden="true"
        >
          <ImageIcon className="text-primary/40 h-8 w-8" />
        </div>

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
