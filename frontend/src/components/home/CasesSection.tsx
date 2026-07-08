"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Leaf,
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

// Cases — 客戶實績（全球傳動）。左側交機前 / 交機後照片，右側 ROI 數據。
// 捲入視窗時右側數字由 0 count-up、左右卡片滑入（尊重 reduced-motion）。
const METRIC_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  wallet: Wallet,
  clock: Clock,
  leaf: Leaf,
};

function CasePhoto({
  src,
  label,
  alt,
  priority,
}: {
  src: string;
  label: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-[16px] border">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 560px"
        priority={priority}
        className="object-cover"
      />
      <span className="bg-ink/70 absolute top-3 left-3 rounded-full px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
        {label}
      </span>
    </div>
  );
}

function MetricRow({
  metric,
  run,
  first,
}: {
  metric: RoiMetric;
  run: boolean;
  first: boolean;
}) {
  const Icon = METRIC_ICONS[metric.icon] ?? Zap;
  return (
    <div
      className={`flex items-center gap-4 py-4 ${first ? "" : "border-t border-white/10"}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Icon size={20} className="text-primary-soft" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-text-on-dark-muted text-[13px]">
          {metric.label}
        </span>
        <span className="font-mono text-[22px] font-bold text-white tabular-nums sm:text-[24px]">
          <AnimatedNumber raw={metric.value} run={run} />
        </span>
      </div>
    </div>
  );
}

export function CasesSection() {
  // 進入視窗（約 100px 進場）才啟動右側 ROI 數字 count-up。
  const { ref, inView } = useInViewOnce<HTMLDivElement>("0px 0px -100px 0px");
  const c = HOME_CASE;

  return (
    <section className="border-border bg-surface overflow-x-clip border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-6 py-16 md:px-20 md:py-[72px]">
        <Reveal className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2.5">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
              CASE STUDIES · 客戶實績
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              數字會說話：{c.client}節能實績
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
          className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]"
        >
          {/* 左：交機前 / 交機後 個案照片 */}
          <Reveal direction="left" className="flex flex-col gap-4">
            <CasePhoto
              src={c.beforeImage}
              label="交機前"
              alt={`${c.client}交機前`}
              priority
            />
            <CasePhoto
              src={c.afterImage}
              label="交機後"
              alt={`${c.client}交機後`}
            />
          </Reveal>

          {/* 右：ROI 數據面板 */}
          <Reveal direction="right" delay={80} className="h-full">
            <div className="border-steel flex h-full flex-col rounded-[18px] border bg-[linear-gradient(140deg,#3a4a42,#1d2620_70%)] p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div className="flex flex-col gap-1">
                  <span className="text-text-on-dark-muted font-mono text-[12px] tracking-[0.5px] uppercase">
                    ROI 數據
                  </span>
                  <span className="text-[22px] font-bold text-white">
                    {c.client}
                  </span>
                </div>
                <span className="bg-brass-soft text-ink inline-flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-semibold">
                  <Leaf size={13} aria-hidden="true" />
                  ESG
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-between pt-2">
                {c.metrics.map((metric, i) => (
                  <MetricRow
                    key={metric.label}
                    metric={metric}
                    run={inView}
                    first={i === 0}
                  />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
