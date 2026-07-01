import Link from "next/link";
import { ArrowRight, Leaf, Zap } from "lucide-react";
import { HOME_CASES, type HomeCase } from "@/components/home/content";

// Cases — 客戶實績（數字會說話）。白底、深色漸層卡 ×2，before / after 對比長條，
// 金屬副色（brass 徽章 + ⚡）克制點綴。內容為模擬數據（見 content.ts）。

function CaseBar({
  label,
  value,
  pct,
  fill,
}: {
  label: string;
  value: string;
  pct: number;
  fill: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-text-on-dark-muted text-[13px]">{label}</span>
        <span className="font-mono text-[15px] font-semibold text-white">
          {value}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CaseCard({ item }: { item: HomeCase }) {
  return (
    <div className="border-steel flex flex-col gap-5 rounded-[18px] border bg-[linear-gradient(120deg,#54685c,#71877a_24%,#3a4a42_58%,#1d2620)] p-7">
      <div className="flex items-center justify-between">
        <span className="bg-surface-dark-2 rounded-[20px] px-3 py-1.5 text-[13px] font-medium text-white">
          {item.industry}
        </span>
        <span className="bg-brass-soft text-ink inline-flex items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-semibold">
          <Leaf size={13} aria-hidden="true" />
          {item.reduction}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        <CaseBar {...item.before} fill="bg-steel-soft" />
        <CaseBar {...item.after} fill="bg-primary-soft" />
      </div>

      <div className="border-border-dark flex items-center gap-2 border-t pt-4">
        <Zap size={16} aria-hidden="true" className="text-brass" />
        <span className="text-[15px] font-semibold text-white">
          {item.saving}
        </span>
      </div>
    </div>
  );
}

export function CasesSection() {
  return (
    <section className="border-border bg-surface border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-6 py-16 md:px-20 md:py-[72px]">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2.5">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
              CASE STUDIES · 客戶實績
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              數字會說話：客戶的 before / after
            </h2>
            <p className="text-text-muted max-w-[640px] text-[15px] leading-[1.6]">
              平均為客戶減碳約 −36%、年省電費逾 200
              萬。以下為模擬數據，實際案例待業主提供。
            </p>
          </div>
          <Link
            href="/news"
            className="text-primary-deep inline-flex shrink-0 items-center gap-1.5 text-[14px] font-semibold"
          >
            看更多案例
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {HOME_CASES.map((item) => (
            <CaseCard key={item.industry} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
