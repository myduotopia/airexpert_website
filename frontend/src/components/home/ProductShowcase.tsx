import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomeProducts } from "@/lib/data/home";

// 產品系列 — 標題與卡片皆來自 site_settings `home_products`。
export function ProductShowcase({ content }: { content: HomeProducts }) {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[30px] font-bold sm:text-[38px]">
            {content.title}
          </h2>
          <p className="text-text-muted max-w-[560px] text-[17px] leading-[1.6]">
            {content.description}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.categories.map((c) => (
            <Link
              key={c.name}
              href={`/products?category=${encodeURIComponent(c.name)}`}
              aria-label={`查看${c.name}系列`}
              className="border-border bg-surface group hover:border-primary focus-visible:ring-primary flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-[0_6px_28px_rgba(22,32,26,0.07)] focus-visible:ring-2 focus-visible:outline-none"
            >
              <div className="bg-surface flex aspect-[4/3] items-center justify-center p-6">
                <Image
                  src={c.image_url}
                  alt={c.name}
                  width={800}
                  height={800}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="border-border flex flex-col gap-2 border-t p-6">
                <h3 className="text-ink text-[20px] font-semibold">{c.name}</h3>
                <p className="text-text-muted text-[16px] leading-[1.6]">
                  {c.desc}
                </p>
                <span className="text-primary-deep mt-1 inline-flex items-center gap-1 text-[15px] font-medium">
                  查看系列
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
