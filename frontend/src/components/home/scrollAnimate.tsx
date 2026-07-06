"use client";

// 首頁進場動畫共用工具：
// - useInViewOnce：以 IntersectionObserver 偵測元素進入視窗一次（threshold 0，
//   可用 rootMargin 微調觸發時機），回傳 ref 與 inView。
// - AnimatedNumber：數值字串的 count-up（由 0 跳到目標），保留前後綴與千分位，
//   尊重 prefers-reduced-motion。
import { useEffect, useMemo, useRef, useState } from "react";

const DURATION_MS = 1400;

export function useInViewOnce<T extends Element>(rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

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

/**
 * 數值字串 count-up。run 轉 true 時由 0 動畫到目標值；無數字則原樣顯示。
 * durationMs 可調整動畫時長（預設 1400ms）。
 */
export function AnimatedNumber({
  raw,
  run,
  durationMs = DURATION_MS,
}: {
  raw: string;
  run: boolean;
  durationMs?: number;
}) {
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
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(parsed.target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(parsed.target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parsed, run, durationMs]);

  if (!parsed) return <>{raw}</>;
  return (
    <>
      {parsed.prefix}
      {formatNumber(n, parsed.decimals, parsed.grouped)}
      {parsed.suffix}
    </>
  );
}
