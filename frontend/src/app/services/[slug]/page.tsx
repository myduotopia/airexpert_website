import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getServiceBySlug, getPublishedServices } from "@/lib/data";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

// Next 16：dynamic `params` 為 Promise，須 await（見 node_modules/next/dist/docs）。
type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

// 已發佈服務在 build 時預先產生；新 slug 仍會 on-demand 渲染（dynamicParams 預設 true）。
export async function generateStaticParams() {
  const services = await getPublishedServices();
  return services.map((service) => ({ slug: service.slug }));
}

// generateMetadata 與頁面都呼叫 getServiceBySlug；資料層以 React cache() 包裝，
// 同一請求內只查一次。讀 seo_title / seo_description，缺時退回 title / summary。
export async function generateMetadata(
  props: DetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  const service = await getServiceBySlug(slug);

  if (!service) {
    return { title: "找不到服務項目" };
  }

  const title = service.seo_title ?? service.title;
  const description = service.seo_description ?? service.summary ?? undefined;
  const cover = service.images?.find((img) => img?.url)?.url;

  return {
    title,
    description,
    openGraph: cover
      ? { title, description, images: [cover] }
      : { title, description },
  };
}

export default async function ServiceDetailPage(props: DetailPageProps) {
  const { slug } = await props.params;
  const service = await getServiceBySlug(slug);

  if (!service) {
    notFound();
  }

  const gallery = (service.images ?? []).filter((img) => img?.url);
  const hero = gallery[0];

  return (
    <>
      {/* Breadcrumb */}
      <section className="bg-surface-muted border-border border-b">
        <div className="text-text-muted mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-6 py-4 font-mono text-[12px] md:px-20">
          <Link href="/" className="hover:text-primary-deep transition-colors">
            首頁
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/services"
            className="hover:text-primary-deep transition-colors"
          >
            服務項目
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{service.title}</span>
        </div>
      </section>

      {/* Hero：左 標題/摘要、右 主圖（無圖時單欄） */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-6 py-14 md:grid-cols-[1fr_560px] md:px-20 md:py-16">
          <div className="flex flex-col gap-5">
            <p className="text-primary-deep font-mono text-[12px] tracking-[1px]">
              服務項目 · OUR SERVICES
            </p>
            <h1 className="text-ink text-[32px] leading-[1.15] font-bold sm:text-[42px]">
              {service.title}
            </h1>
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
                href="/services"
                className="border-border text-ink hover:bg-surface-muted inline-flex items-center gap-2 rounded-[26px] border bg-white px-6 py-3.5 text-[15px] font-medium transition-colors"
              >
                所有服務
              </Link>
            </div>
          </div>

          {hero ? (
            <div className="border-border relative aspect-[560/460] w-full overflow-hidden rounded-[16px] border">
              <Image
                src={hero.url}
                alt={hero.alt ?? service.title}
                fill
                sizes="(max-width: 768px) 100vw, 560px"
                priority
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* Body：CMS body_html（經 sanitizeBodyHtml allowlist 消毒後渲染，防 stored XSS） */}
      <section className="bg-surface-muted border-border border-y">
        <div className="mx-auto max-w-[860px] px-6 py-14 md:px-0 md:py-16">
          {service.body_html ? (
            <div
              className="text-ink/90 [&_a]:text-primary-deep [&_h2]:text-ink [&_h3]:text-ink max-w-none text-[17px] leading-[1.8] [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[20px] [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{
                __html: sanitizeBodyHtml(service.body_html),
              }}
            />
          ) : (
            <p className="text-text-muted text-[16px]">內容建置中。</p>
          )}

          {/* 內文圖庫（images jsonb；第一張作 hero，其餘列於此） */}
          {gallery.length > 1 ? (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {gallery.slice(1).map((img, i) => (
                <div
                  key={img.url}
                  className="border-border relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? `${service.title} 圖 ${i + 2}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 400px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="border-border mt-12 border-t pt-8">
            <Link
              href="/services"
              className="text-primary-deep inline-flex items-center gap-2 text-[15px] font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              返回服務項目
            </Link>
          </div>
        </div>
      </section>

      <ServiceCtaBanner />
    </>
  );
}
