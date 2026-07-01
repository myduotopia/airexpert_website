"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type RailSectionProps = {
  eyebrow: string;
  title: string;
  /** light = 白底(News)、dark = 深色 ink 底(Products)。 */
  variant?: "light" | "dark";
  /** 是否加下框線（區段分隔）。 */
  bordered?: boolean;
  children: ReactNode;
};

/**
 * 首頁橫向 rail 區段（Products / News 共用）。標題列右側箭頭以 scrollBy 捲動下方軌道；
 * 軌道原生可橫向捲動 / 觸控滑動。卡片由 server 端 render 後以 children 傳入。
 */
export function RailSection({
  eyebrow,
  title,
  variant = "light",
  bordered = false,
  children,
}: RailSectionProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const dark = variant === "dark";

  const arrowBase =
    "flex h-12 w-12 items-center justify-center rounded-full transition-colors focus-visible:ring-primary focus-visible:ring-2 focus-visible:outline-none";
  const leftArrow = dark
    ? `${arrowBase} border-brass border bg-white/10 text-white hover:bg-white/20`
    : `${arrowBase} border-border border bg-ink/[0.06] text-text-muted hover:bg-ink/10`;
  const rightArrow = `${arrowBase} bg-brass text-ink hover:opacity-90`;

  return (
    <section
      className={`${dark ? "bg-ink" : "bg-surface"} ${
        bordered ? "border-border border-b" : ""
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 py-16 md:py-[72px]">
        {/* 標題列（含左右 gutter） */}
        <div className="flex items-end justify-between gap-4 px-6 md:px-20">
          <div className="flex flex-col gap-2.5">
            <p
              className={`font-mono text-[12px] tracking-[1px] uppercase ${
                dark ? "text-steel" : "text-primary-deep"
              }`}
            >
              {eyebrow}
            </p>
            <h2
              className={`text-[26px] font-bold sm:text-[32px] ${
                dark ? "text-white" : "text-ink"
              }`}
            >
              {title}
            </h2>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              aria-label="上一組"
              onClick={() => scroll(-1)}
              className={leftArrow}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="下一組"
              onClick={() => scroll(1)}
              className={rightArrow}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 橫向軌道：左 gutter 對齊、右側可捲出 */}
        <div
          ref={trackRef}
          className="flex snap-x [scrollbar-width:none] gap-6 overflow-x-auto px-6 pb-2 md:px-20 [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
