import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";
import { ServiceGallery } from "@/components/services/ServiceGallery";
import { previewServices } from "./data";

// 服務項目改版「測試預覽」頁：內容鏡射 seed、圖片走 /public 靜態檔，完全不讀 DB，
// 正式 /services 不受影響。noindex 避免被搜尋引擎收錄。改版定案後可整個目錄刪除。
export const metadata: Metadata = {
  title: "服務項目（測試預覽）",
  robots: { index: false, follow: false },
};

const PROSE_CLASS =
  "text-ink/90 [&_a]:text-primary-deep [&_h2]:text-ink [&_h3]:text-ink max-w-none text-[17px] leading-[1.8] [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[20px] [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6";

export default function ServicesTestingPage() {
  return (
    <>
      {/* 測試預覽提示 */}
      <div
        id="top"
        className="bg-primary/10 text-primary-deep border-primary/20 border-b px-6 py-2.5 text-center font-mono text-[12.5px]"
      >
        測試預覽 · 此頁為服務項目改版預覽，正式 /services 不受影響。
      </div>

      {/* 索引：標題 + 卡片（含縮圖） */}
      <section
        id="services-index"
        className="bg-surface border-border scroll-mt-4 border-b"
      >
        <div className="mx-auto max-w-[1200px] px-6 py-14 md:px-20">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1.5px]">
            SERVICES · 服務項目
          </p>
          <h1 className="text-ink mt-3 text-[32px] leading-[1.12] font-extrabold sm:text-[44px]">
            一站式節能氣源服務
          </h1>
          <p className="text-text-muted mt-3 max-w-[720px] text-[16px] leading-[1.7]">
            從觀念釐清、技術導入到機房規劃與碳盤查，AirExpert
            以完整服務協助工廠提升能源效率、邁向淨零。
          </p>

          <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {previewServices.map((service) => {
              const thumb = service.images[0];
              return (
                <a
                  key={service.slug}
                  href={`#${service.slug}`}
                  className="border-border bg-surface hover:border-primary group flex flex-col gap-4 rounded-[16px] border p-6 transition-colors"
                >
                  {thumb ? (
                    <div className="border-border relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border">
                      <Image
                        src={thumb.url}
                        alt={thumb.alt || service.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : null}
                  <h2 className="text-ink text-[20px] font-semibold">
                    {service.title}
                  </h2>
                  <p className="text-text-muted text-[16px] leading-[1.65]">
                    {service.summary}
                  </p>
                  <span className="text-primary-deep mt-auto inline-flex items-center gap-1 text-[16px] font-medium">
                    了解更多
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* 各服務詳細（鏡射 /services/[slug] 版面） */}
      {previewServices.map((service) => {
        const hero = service.images[0];
        const gallery = service.images.slice(1);
        return (
          <div
            key={service.slug}
            id={service.slug}
            className="scroll-mt-[100px]"
          >
            {/* Hero */}
            <section className="bg-surface">
              <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-6 py-14 md:grid-cols-[1fr_560px] md:px-20 md:py-16">
                <div className="flex flex-col gap-5">
                  <p className="text-primary-deep font-mono text-[12px] tracking-[1px]">
                    服務項目 · OUR SERVICES
                  </p>
                  <h2 className="text-ink text-[32px] leading-[1.15] font-bold sm:text-[42px]">
                    {service.title}
                  </h2>
                  <p className="text-text-muted max-w-[560px] text-[15px] leading-[1.65]">
                    {service.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="bg-primary inline-flex items-center gap-2 rounded-[26px] px-6 py-3.5 text-[15px] font-semibold text-white">
                      預約能源診斷
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="border-border text-ink inline-flex items-center gap-2 rounded-[26px] border bg-white px-6 py-3.5 text-[15px] font-medium">
                      所有服務
                    </span>
                  </div>
                </div>

                {hero ? (
                  <div className="border-border bg-surface aspect-[16/9] w-full overflow-hidden rounded-[16px] border">
                    <div className="relative h-full w-full">
                      <Image
                        src={hero.url}
                        alt={hero.alt || service.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 560px"
                        className="object-cover"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Body + 圖庫 */}
            <section className="bg-surface-muted border-border border-y">
              <div className="mx-auto max-w-[860px] px-6 py-14 md:px-0 md:py-16">
                <div
                  className={PROSE_CLASS}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeBodyHtml(service.body),
                  }}
                />

                <ServiceGallery images={gallery} fallbackAlt={service.title} />

                <div className="border-border mt-12 border-t pt-8">
                  <a
                    href="#top"
                    className="text-primary-deep inline-flex items-center gap-2 text-[15px] font-semibold"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    回到最上方
                  </a>
                </div>
              </div>
            </section>
          </div>
        );
      })}

      <ServiceCtaBanner />
    </>
  );
}
