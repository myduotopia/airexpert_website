import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { getPublishedServices } from "@/lib/data";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";
import { ServiceGallery } from "@/components/services/ServiceGallery";

export const metadata: Metadata = {
  title: "服務項目",
  description:
    "AirExpert 超勁賀空壓科技提供一站式節能氣源服務：節能方案、節能技術、機房規劃與減碳行動，協助工廠落實高效與淨零。",
};

// 內文富文本樣式（與 /services/[slug] 一致）。
const PROSE_CLASS =
  "text-ink/90 [&_a]:text-primary-deep [&_h2]:text-ink [&_h3]:text-ink max-w-none text-[17px] leading-[1.8] [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[20px] [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6";

// 一頁式服務項目：索引卡片（錨點至各區塊）＋四個服務區塊（Hero＋內文＋圖庫）。
// DB-driven（getPublishedServices）；內文圖點擊可放大（ServiceGallery）。
export default async function ServicesIndexPage() {
  const services = await getPublishedServices();

  return (
    <>
      <span id="top" className="sr-only" aria-hidden="true" />

      <ServiceHeader
        eyebrow="SERVICES · 服務項目"
        title="一站式節能氣源服務"
        tagline="從觀念釐清、技術導入到機房規劃與碳盤查，AirExpert 以完整服務協助工廠提升能源效率、邁向淨零。"
      />

      {services.length === 0 ? (
        <section className="bg-surface">
          <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20">
            <p className="text-text-muted text-[16px]">服務項目建置中。</p>
          </div>
        </section>
      ) : (
        <>
          {/* 索引卡片（含縮圖，點擊錨點至各區塊） */}
          <section className="bg-surface border-border border-b">
            <div className="mx-auto max-w-[1440px] px-6 py-14 md:px-20">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {services.map((service) => {
                  const thumb = (service.images ?? []).find((img) => img?.url);
                  return (
                    <a
                      key={service.id}
                      href={`#${service.slug}`}
                      className="border-border bg-surface focus-visible:ring-primary hover:border-primary group flex flex-col gap-4 rounded-[16px] border p-6 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {thumb ? (
                        <div className="border-border relative aspect-[16/10] w-full overflow-hidden rounded-[10px] border">
                          <Image
                            src={thumb.url}
                            alt={thumb.alt ?? service.title}
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </div>
                      ) : null}
                      <h2 className="text-ink text-[20px] font-semibold">
                        {service.title}
                      </h2>
                      {service.summary ? (
                        <p className="text-text-muted text-[16px] leading-[1.65]">
                          {service.summary}
                        </p>
                      ) : null}
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

          {/* 各服務區塊 */}
          {services.map((service) => {
            const gallery = (service.images ?? []).filter((img) => img?.url);
            const hero = gallery[0];
            return (
              <div
                key={service.id}
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
                      {service.summary ? (
                        <p className="text-text-muted max-w-[560px] text-[15px] leading-[1.65]">
                          {service.summary}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Link
                          href="/contact"
                          className="bg-primary hover:bg-primary-deep inline-flex items-center gap-2 rounded-[26px] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors"
                        >
                          預約能源診斷
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link
                          href={`/services/${service.slug}`}
                          className="border-border text-ink hover:bg-surface-muted inline-flex items-center gap-2 rounded-[26px] border bg-white px-6 py-3.5 text-[15px] font-medium transition-colors"
                        >
                          單頁檢視
                        </Link>
                      </div>
                    </div>

                    {hero ? (
                      <div className="border-border bg-surface aspect-[16/9] w-full overflow-hidden rounded-[16px] border">
                        <div className="relative h-full w-full">
                          <Image
                            src={hero.url}
                            alt={hero.alt ?? service.title}
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
                    {service.body_html ? (
                      <div
                        className={PROSE_CLASS}
                        dangerouslySetInnerHTML={{
                          __html: sanitizeBodyHtml(service.body_html),
                        }}
                      />
                    ) : (
                      <p className="text-text-muted text-[16px]">
                        內容建置中。
                      </p>
                    )}

                    <ServiceGallery
                      images={gallery.slice(1)}
                      fallbackAlt={service.title}
                    />

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
        </>
      )}

      <ServiceCtaBanner />
    </>
  );
}
