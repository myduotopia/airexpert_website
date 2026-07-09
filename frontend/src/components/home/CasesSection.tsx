"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Leaf,
  TrendingDown,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { HOME_CASE, type RoiMetric } from "@/components/home/content";
import {
  AnimatedNumber,
  Reveal,
  useInViewOnce,
} from "@/components/home/scrollAnimate";

// Cases — 客戶實績（匿名製造廠）。左側改善前 / 改善後照片 collage（左上 + 右下重疊、
// 交機後壓去背 logo、左下浮動亮點徽章），右側 ROI 數據面板（主打大數字 + 支撐數據
// + CTA）。捲入視窗時照片左右滑入、數字 0 count-up（尊重 reduced-motion）。
const METRIC_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  wallet: Wallet,
  clock: Clock,
  leaf: Leaf,
};

function CollagePhoto({
  src,
  label,
  alt,
  position,
  run,
  logo,
}: {
  src: string;
  label: string;
  alt: string;
  position: "before" | "after";
  run: boolean;
  logo?: string;
}) {
  const isBefore = position === "before";
  const place = isBefore ? "top-0 left-0 z-10" : "right-0 bottom-0 z-20";
  const hidden = isBefore
    ? "-translate-x-6 opacity-0"
    : "translate-x-6 opacity-0";
  return (
    <div
      className={`absolute ${place} aspect-[4/3] w-[68%] overflow-hidden rounded-[16px] border-4 border-white shadow-[0_20px_44px_rgba(22,32,26,0.24)] transition-all duration-700 ease-out ${
        isBefore ? "" : "delay-150"
      } motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        run ? "translate-x-0 opacity-100" : hidden
      }`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 60vw, 380px"
        priority={isBefore}
        className="object-cover"
      />
      <span className="bg-ink/70 absolute top-3 left-3 rounded-full px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
        {label}
      </span>
      {logo ? (
        <Image
          src={logo}
          alt=""
          aria-hidden="true"
          width={432}
          height={333}
          className="absolute right-3 bottom-2 h-auto w-[36%] max-w-[150px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
        />
      ) : null}
    </div>
  );
}

/** 左下浮動亮點徽章：把改善故事直接連到關鍵成果。 */
function SpotlightBadge({ metric, run }: { metric: RoiMetric; run: boolean }) {
  const Icon = METRIC_ICONS[metric.icon] ?? Zap;
  return (
    <div
      className={`border-border absolute bottom-0 left-0 z-30 flex items-center gap-3 rounded-[16px] border bg-white/95 py-3 pr-5 pl-4 shadow-[0_16px_36px_rgba(22,32,26,0.18)] backdrop-blur-sm transition-all delay-300 duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
        run ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <span className="bg-primary-soft/20 flex h-10 w-10 items-center justify-center rounded-full">
        <Icon size={18} className="text-primary-deep" aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="text-text-muted text-[12px]">{metric.label}</span>
        <span className="text-ink font-mono text-[20px] font-bold tabular-nums">
          <AnimatedNumber raw={metric.value} run={run} />
        </span>
      </span>
    </div>
  );
}

// 電費逐月下降趨勢（示意）：長條相對高度（%），進場時由 0 依序長上來。
const COST_TREND = [100, 91, 80, 70, 62, 56, 52];

function MiniTrend({ run }: { run: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex h-32 items-end gap-2">
        {COST_TREND.map((h, i) => (
          <span
            key={i}
            className="from-primary-deep to-primary-soft w-4 rounded-t-[4px] bg-gradient-to-t transition-[height] duration-700 ease-out motion-reduce:transition-none"
            style={{
              height: run ? `${h}%` : "0%",
              transitionDelay: run ? `${i * 70}ms` : "0ms",
            }}
          />
        ))}
      </div>
      <span className="text-text-on-dark-muted inline-flex items-center gap-1 text-[12px]">
        <TrendingDown size={14} aria-hidden="true" />
        月電費逐月下降
      </span>
    </div>
  );
}

/** 右側面板支撐數據列。 */
function MetricRow({ metric, run }: { metric: RoiMetric; run: boolean }) {
  const Icon = METRIC_ICONS[metric.icon] ?? Zap;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 py-3.5">
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Icon size={17} className="text-primary-soft" aria-hidden="true" />
        </span>
        <span className="text-text-on-dark-muted text-[14px]">
          {metric.label}
        </span>
      </span>
      <span className="font-mono text-[18px] font-bold text-white tabular-nums">
        <AnimatedNumber raw={metric.value} run={run} />
      </span>
    </div>
  );
}

export function CasesSection() {
  // 進入視窗（約 100px 進場）才啟動照片滑入與右側數字 count-up。
  const { ref, inView } = useInViewOnce<HTMLDivElement>("0px 0px -100px 0px");
  const c = HOME_CASE;
  const hero = c.metrics[0];
  const rest = c.metrics.slice(1);

  return (
    <section className="border-border bg-surface overflow-x-clip border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-6 py-16 md:px-20 md:py-[72px]">
        <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2.5">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
              CASE STUDIES · 客戶實績
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              數字會說話：{c.client}節能改造
            </h2>
            <p className="text-text-muted max-w-[640px] text-[15px] leading-[1.6]">
              導入變頻節能方案後的實測 ROI ——
              節電、省費、快速回收，同步達成減碳。
            </p>
          </div>
          <Link
            href="/cases"
            className="text-primary-deep inline-flex shrink-0 items-center gap-1.5 text-[14px] font-semibold"
          >
            看更多案例
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </Reveal>

        <div
          ref={ref}
          className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1.05fr_0.95fr]"
        >
          {/* 左：改善前（左上）/ 改善後（右下）重疊 collage + 浮動亮點 + 標籤 */}
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[100/84] w-full">
              <CollagePhoto
                src={c.beforeImage}
                label="改善前"
                alt={`${c.client}改善前`}
                position="before"
                run={inView}
              />
              <CollagePhoto
                src={c.afterImage}
                label="改善後"
                alt={`${c.client}改善後`}
                position="after"
                run={inView}
                logo={c.logo}
              />
              <SpotlightBadge metric={c.spotlight} run={inView} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.tags.map((tag) => (
                <span
                  key={tag}
                  className="border-border text-text-muted bg-surface-muted rounded-full border px-3 py-1 text-[12.5px] font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 右：ROI 面板（主打大數字 + 支撐數據 + CTA + 光暈） */}
          <Reveal direction="right" delay={80}>
            <div className="border-steel relative overflow-hidden rounded-[18px] border bg-[linear-gradient(140deg,#3a4a42,#1d2620_70%)] p-8">
              {/* 底色漸層：進場（數字 count-up）時由深慢慢轉淺 —— 疊一層較淺漸層淡入 */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,#6d8579,#38443d_70%)] transition-opacity duration-[2600ms] ease-out motion-reduce:transition-none ${
                  inView ? "opacity-100" : "opacity-0"
                }`}
              />
              {/* 綠色光暈點綴 */}
              <div
                aria-hidden="true"
                className="bg-primary/25 pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl"
              />
              <div className="relative flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-text-on-dark-muted font-mono text-[12px] tracking-[0.5px] uppercase">
                      ROI 數據
                    </span>
                    <span className="text-[20px] font-bold text-white">
                      {c.client}
                    </span>
                  </div>
                  <span className="bg-brass-soft text-ink inline-flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-semibold">
                    <Leaf size={13} aria-hidden="true" />
                    ESG
                  </span>
                </div>

                {/* 主打大數字 + brass 細線 + 電費趨勢迷你長條圖 */}
                <div className="mt-6 flex items-end justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <span
                      aria-hidden="true"
                      className="h-[3px] w-[64px] rounded-[2px] bg-[linear-gradient(90deg,var(--color-brass-deep),var(--color-brass)_35%,transparent)]"
                    />
                    <span className="text-text-on-dark-muted text-[13px]">
                      {hero.label}
                    </span>
                    <span className="text-primary-soft font-mono text-[46px] leading-none font-bold tabular-nums sm:text-[52px]">
                      <AnimatedNumber raw={hero.value} run={inView} />
                    </span>
                  </div>
                  <MiniTrend run={inView} />
                </div>

                {/* 支撐數據 */}
                <div className="mt-6 flex flex-col">
                  {rest.map((metric) => (
                    <MetricRow
                      key={metric.label}
                      metric={metric}
                      run={inView}
                    />
                  ))}
                </div>

                {/* CTA */}
                <Link
                  href="/contact"
                  className="bg-primary-soft text-ink focus-visible:ring-primary-soft mt-7 inline-flex items-center justify-center gap-2 rounded-[26px] px-6 py-3 text-[15px] font-semibold transition-colors hover:bg-white focus-visible:ring-2 focus-visible:outline-none"
                >
                  預約節能評估
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
