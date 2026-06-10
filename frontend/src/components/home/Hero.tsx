import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";

// Section 1 — Hero (bg white). Centered, vertical stack. Hero font sizes scale
// down on mobile per the responsive spec.
export function Hero() {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-[26px] px-6 pt-[72px] pb-[64px] text-center md:px-20 md:pt-[88px] md:pb-[72px]">
        {/* Eyebrow pill */}
        <span className="border-border bg-surface-muted inline-flex items-center gap-2 rounded-[20px] border px-[14px] py-1.5">
          <Leaf className="text-primary h-[13px] w-[13px]" aria-hidden="true" />
          <span className="text-primary-deep font-mono text-[14px] tracking-[0.5px]">
            創立於 1997 · 台灣製造
          </span>
        </span>

        <h1 className="text-ink max-w-[960px] text-[36px] leading-[1.12] font-bold sm:text-[46px] md:text-[62px]">
          節能氣源，邁向淨零的製造未來
        </h1>

        <p className="text-text-muted max-w-[680px] text-[18px] leading-[1.6] md:text-[20px]">
          無油空壓、真空與乾燥系統結合智慧能源管理，協助台灣製造業降低能耗、減少碳排，落實
          ESG 永續承諾。
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/products"
            className="bg-primary-deep inline-flex items-center justify-center gap-2 rounded-[26px] px-[26px] py-[14px] text-[17px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            探索產品系列
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/contact"
            className="border-border text-ink bg-surface hover:bg-surface-muted inline-flex items-center justify-center rounded-[26px] border px-[26px] py-[14px] text-[17px] font-semibold transition-colors"
          >
            預約專人談話
          </Link>
        </div>
      </div>
    </section>
  );
}
