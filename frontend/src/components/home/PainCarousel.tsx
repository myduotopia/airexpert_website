"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HomeCarousel } from "@/lib/data/home";

const INTERVAL_MS = 6000;

// 痛點編號依索引自動產生（補零至兩位）：第 0 張 → 「01」。
function painNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function PainCarousel({
  slides: rawSlides,
}: {
  slides: HomeCarousel["slides"];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // 防呆：跳過沒有圖片的投影片（空 src 會讓 next/image 崩潰）。
  const slides = rawSlides.filter((s) => s.image_url);
  const count = slides.length;

  const goTo = useCallback(
    (n: number) => setIndex(count > 0 ? (n + count) % count : 0),
    [count],
  );

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(() => setIndex((p) => (p + 1) % count), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, count]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="氣源系統常見痛點"
      className="bg-surface-dark relative w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-[440px] sm:h-[520px] lg:h-[600px]">
        {slides.map((s, idx) => {
          const n = painNumber(idx);
          return (
            <div
              key={idx}
              role="group"
              aria-roledescription="slide"
              aria-label={`痛點 ${n}：${s.category}`}
              aria-hidden={idx !== index}
              className={`absolute inset-0 transition-opacity duration-700 ${
                idx === index ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <Image
                src={s.image_url}
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
                  <p className="text-primary-soft font-mono text-[15px] tracking-[1px]">
                    痛點 {n} · {s.category}
                  </p>
                  <h2 className="mt-3 max-w-[20ch] text-[30px] leading-[1.2] font-bold text-white sm:text-[42px] lg:text-[54px]">
                    {s.headline}
                  </h2>
                  <p className="mt-3 text-[18px] text-white/85 sm:text-[22px]">
                    {s.tagline}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

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
          {slides.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`切換到痛點 ${painNumber(idx)}`}
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
