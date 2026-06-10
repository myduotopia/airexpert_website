import type { Metadata } from "next";
import Link from "next/link";
import { Construction } from "lucide-react";

export const metadata: Metadata = {
  title: "內容更新中",
  // Interim page — don't index it.
  robots: { index: false, follow: true },
};

// Interim "content updating" page. Nav items (產品系列/解決方案/技術文獻/
// 最新消息/關於) redirect here via next.config.ts while their content is
// being finalised. Renders inside the shell (header + copyright footer).
export default function MaintenancePage() {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[680px] flex-col items-center gap-6 px-6 py-32 text-center md:py-40">
        <span className="bg-primary-soft/20 flex h-[76px] w-[76px] items-center justify-center rounded-full">
          <Construction className="text-primary h-9 w-9" aria-hidden="true" />
        </span>
        <p className="text-primary-deep font-mono text-[13px] tracking-[1px] uppercase">
          COMING SOON · 內容建置中
        </p>
        <h1 className="text-ink text-[36px] leading-[1.2] font-bold sm:text-[48px]">
          網站內容更新中
        </h1>
        <p className="text-text-muted text-[17px] leading-[1.6]">
          我們正在整理這個單元的內容，很快就會與您見面。如有產品或服務需求，歡迎直接與我們聯繫。
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="bg-primary-deep inline-flex items-center justify-center rounded-[26px] px-7 py-[14px] text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            返回首頁
          </Link>
          <Link
            href="/contact"
            className="border-border text-ink hover:border-primary inline-flex items-center justify-center rounded-[26px] border px-7 py-[14px] text-[15px] font-semibold transition-colors"
          >
            聯絡我們
          </Link>
        </div>
        <p className="text-text-muted mt-1 font-mono text-[13px] tracking-[0.5px]">
          全國免付費專線　0800-88-4588
        </p>
      </div>
    </section>
  );
}
