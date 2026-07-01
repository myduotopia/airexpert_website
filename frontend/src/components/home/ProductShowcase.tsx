import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeProducts } from "@/lib/data/home";
import { RailSection } from "@/components/home/RailSection";

// 產品系列 — 深色 ink 底橫向 rail。標題來自 site_settings `home_products`，
// 分類卡點擊導往 /products?category=<name>。
export function ProductShowcase({ content }: { content: HomeProducts }) {
  return (
    <RailSection eyebrow={content.eyebrow} title={content.title} variant="dark">
      {/* 防呆：跳過沒有圖片的分類（空 src 會讓 next/image 崩潰）。 */}
      {content.categories
        .filter((c) => c.image_url)
        .map((c, idx) => (
          <Link
            key={`${c.name}-${idx}`}
            href={`/products?category=${encodeURIComponent(c.name)}`}
            aria-label={`查看${c.name}系列`}
            className="group border-border bg-surface hover:border-primary flex w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border transition-colors sm:w-[420px]"
          >
            <div className="bg-surface flex h-[240px] items-center justify-center p-4 sm:h-[300px]">
              <Image
                src={c.image_url}
                alt={c.name}
                width={800}
                height={800}
                sizes="420px"
                className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="border-border flex flex-col gap-2 border-t px-5 pt-[18px] pb-[22px]">
              <h3 className="text-ink text-[19px] font-semibold">{c.name}</h3>
              <p className="text-text-muted text-[14px] leading-[1.5]">
                {c.desc}
              </p>
              <span className="text-primary-deep mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold">
                查看系列
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </div>
          </Link>
        ))}
    </RailSection>
  );
}
