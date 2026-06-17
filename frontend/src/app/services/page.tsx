import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedServices } from "@/lib/data";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import { ServiceSection } from "@/components/services/ServiceSection";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "服務項目",
  description:
    "AirExpert 超勁賀空壓科技提供一站式節能氣源服務：節能方案、節能技術、機房規劃與減碳行動，協助工廠落實高效與淨零。",
};

export default async function ServicesIndexPage() {
  const services = await getPublishedServices();

  return (
    <>
      <ServiceHeader
        eyebrow="SERVICES · 服務項目"
        title="一站式節能氣源服務"
        tagline="從觀念釐清、技術導入到機房規劃與碳盤查，AirExpert 以完整服務協助工廠提升能源效率、邁向淨零。"
      />

      <ServiceSection>
        {services.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.slug}`}
                className="border-border bg-surface focus-visible:ring-primary hover:border-primary group flex flex-col gap-4 rounded-[16px] border p-6 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
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
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-[16px]">服務項目建置中。</p>
        )}
      </ServiceSection>

      <ServiceCtaBanner />
    </>
  );
}
