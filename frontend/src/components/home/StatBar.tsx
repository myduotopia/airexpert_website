"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HomeStats } from "@/lib/data/home";

// Section — 數字會說話。白底、上下框線；4 欄（手機 2 欄）。內容來自 site_settings
// `home_stats`。數字在捲入視窗時由 0 往上「count-up」動畫到目標值（尊重
// prefers-reduced-motion）。數值字串可含前後綴（例：100,000K / 550萬度+ / 63% /
// 1,000+），動畫只跑數字部分、保留其餘文字與千分位格式。

const DURATION_MS = 1400;

type ParsedValue = {
  prefix: string;
  suffix: string;
  target: number;
  decimals: number;
  grouped: boolean;
};

function parseValue(raw: string): ParsedValue | null {
  const m = raw.match(/^(\D*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const [, prefix, numStr, suffix] = m;
  return {
    prefix,
    suffix,
    target: parseFloat(numStr.replace(/,/g, "")),
    decimals: numStr.includes(".") ? (numStr.split(".")[1]?.length ?? 0) : 0,
    grouped: numStr.includes(","),
  };
}

function formatNumber(n: number, decimals: number, grouped: boolean): string {
  if (decimals > 0) {
    const fixed = n.toFixed(decimals);
    if (!grouped) return fixed;
    const [intPart, dec] = fixed.split(".");
    return `${Number(intPart).toLocaleString("en-US")}.${dec}`;
  }
  const rounded = Math.round(n);
  return grouped ? rounded.toLocaleString("en-US") : String(rounded);
}

function AnimatedValue({ raw, run }: { raw: string; run: boolean }) {
  const parsed = useMemo(() => parseValue(raw), [raw]);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!parsed || !run) return;
    let raf = 0;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      raf = requestAnimationFrame(() => setN(parsed.target));
      return () => cancelAnimationFrame(raf);
    }
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(parsed.target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(parsed.target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parsed, run]);

  if (!parsed) return <>{raw}</>;
  return (
    <>
      {parsed.prefix}
      {formatNumber(n, parsed.decimals, parsed.grouped)}
      {parsed.suffix}
    </>
  );
}

export function StatBar({ content }: { content: HomeStats }) {
  // sentinel 放在區塊底部：等區塊的「底部」進入視窗（threshold 0）才觸發，
  // 避免區塊頂端從螢幕最底剛露出一點就開始跑、使用者其實還沒看到。
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRun(true);
          io.disconnect();
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="border-border bg-surface border-y">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-6 py-11 md:grid-cols-4 md:px-20">
        {content.items.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-3">
            {/* brass 漸層金屬細線（暖金屬點綴） */}
            <span
              aria-hidden="true"
              className="h-[3px] w-[72px] rounded-[2px] bg-[linear-gradient(90deg,var(--color-brass-deep),var(--color-brass)_35%,transparent)]"
            />
            <span className="text-primary-deep font-mono text-[28px] leading-none font-bold tabular-nums sm:text-[34px] md:text-[44px]">
              <AnimatedValue raw={stat.value} run={run} />
            </span>
            <span className="text-text-muted text-[15px]">{stat.label}</span>
          </div>
        ))}
      </div>
      {/* 區塊底部偵測點：滑到此處（區塊底部露出）才啟動 count-up。 */}
      <span ref={sentinelRef} aria-hidden="true" className="block h-0 w-full" />
    </section>
  );
}
