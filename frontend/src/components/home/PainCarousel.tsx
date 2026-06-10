"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Slide = {
  img: string;
  alt: string;
  n: string;
  cat: string;
  headline: string;
  tagline: string;
};

const SLIDES: Slide[] = [
  {
    img: "/hero/pain-01-cost.png",
    alt: "壓縮機房中能源被漩渦吸走，象徵電費成本",
    n: "01",
    cat: "電費過高",
    headline: "空壓機最貴的不是買，是用",
    tagline: "設備不貴，電費才是成本黑洞",
  },
  {
    img: "/hero/pain-02-pressure.png",
    alt: "壓力錶指針劇烈擺動，產線亮起警示燈",
    n: "02",
    cat: "壓力不穩",
    headline: "氣壓忽高忽低，產線最怕這個",
    tagline: "壓力不穩，良率就在流失",
  },
  {
    img: "/hero/pain-03-downtime.png",
    alt: "工廠紅色警示燈亮起，機台停擺、員工等待",
    n: "03",
    cat: "故障停機",
    headline: "一停機，全廠都在等",
    tagline: "停機一分鐘，損失持續放大",
  },
  {
    img: "/hero/pain-04-repair.png",
    alt: "拆開維修中的空壓機，零件與工具散落",
    n: "04",
    cat: "維修頻繁",
    headline: "一直修，一直花錢",
    tagline: "維修不是成本，是無底洞",
  },
  {
    img: "/hero/pain-05-mismatch.png",
    alt: "雜亂的壓縮空氣管路多處漏氣",
    n: "05",
    cat: "系統不匹配",
    headline: "買了機器，卻不適合現場",
    tagline: "選錯規格，比沒買還貴",
  },
];

const INTERVAL_MS = 6000;

export function PainCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (n: number) => setIndex((n + SLIDES.length) % SLIDES.length),
    [],
  );

  useEffect(() => {
    if (paused) return;
    const t = setInterval(
      () => setIndex((p) => (p + 1) % SLIDES.length),
      INTERVAL_MS,
    );
    return () => clearInterval(t);
  }, [paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="氣源系統常見痛點"
      className="bg-surface-dark relative w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-[440px] sm:h-[520px] lg:h-[600px]">
        {SLIDES.map((s, idx) => (
          <div
            key={s.n}
            role="group"
            aria-roledescription="slide"
            aria-label={`痛點 ${s.n}：${s.cat}`}
            aria-hidden={idx !== index}
            className={`absolute inset-0 transition-opacity duration-700 ${
              idx === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <Image
              src={s.img}
              alt={s.alt}
              fill
              priority={idx === 0}
              sizes="100vw"
              className="object-cover"
            />
            {/* Dark scrim for text legibility */}
            <div className="from-surface-dark/95 via-surface-dark/45 to-surface-dark/10 absolute inset-0 bg-gradient-to-t" />
            <div className="absolute inset-0">
              <div className="mx-auto flex h-full max-w-[1440px] flex-col justify-end px-6 pb-16 md:px-12 md:pb-20">
                <p className="text-primary-soft font-mono text-[13px] tracking-[1px]">
                  痛點 {s.n} · {s.cat}
                </p>
                <h2 className="mt-3 max-w-[20ch] text-[28px] leading-[1.2] font-bold text-white sm:text-[40px] lg:text-[52px]">
                  {s.headline}
                </h2>
                <p className="mt-3 text-[16px] text-white/85 sm:text-[20px]">
                  {s.tagline}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Arrows */}
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="上一張"
          className="absolute top-1/2 left-4 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none sm:inline-flex"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="下一張"
          className="absolute top-1/2 right-4 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none sm:inline-flex"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
          {SLIDES.map((s, idx) => (
            <button
              key={s.n}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`切換到痛點 ${s.n}`}
              aria-current={idx === index}
              className={`h-2 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none ${
                idx === index ? "bg-primary-soft w-6" : "w-2 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
