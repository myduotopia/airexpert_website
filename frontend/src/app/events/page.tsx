import type { Metadata } from "next";
import { VideoGallery } from "@/components/events/VideoGallery";

export const metadata: Metadata = {
  title: "公司活動",
  description: "超勁賀空壓科技 交機實錄與公司活動影片花絮。",
};

export default function EventsPage() {
  return (
    <>
      {/* Header band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-20">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            EVENTS · 公司活動
          </p>
          <h1 className="text-ink mt-3 text-[32px] leading-[1.15] font-bold sm:text-[40px]">
            交機實錄與活動影片花絮
          </h1>
          <p className="text-text-muted mt-4 max-w-[640px] text-[17px] leading-[1.65]">
            歷年交機實錄、現場安裝與公司活動影片。
          </p>
        </div>
      </section>

      {/* Video grid */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-20">
          <VideoGallery />
        </div>
      </section>
    </>
  );
}
