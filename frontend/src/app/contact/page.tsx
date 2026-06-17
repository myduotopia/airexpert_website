import type { Metadata } from "next";
import { getContactInfo } from "@/lib/data";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "聯絡我們",
  description:
    "與 AirExpert 超勁賀空壓科技聯繫。南北兩處服務中心，提供空壓系統諮詢、現場評估與節能改善。留下您的需求，專人將盡快與您聯繫。",
};

// 聯絡頁（V3.08 Eco Green Light，frame LZMiB）。
// Hero band（#F1F6F1）→ ContactBody（左：線上諮詢表單；右：南北服務中心聯絡資訊）。
// 聯絡資訊改從 site_settings 的 contact_info 取（is_public 公開讀），DB 未 seed 時退回預設。
export default async function ContactPage() {
  const info = await getContactInfo();

  return (
    <>
      {/* Hero band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-[14px] px-6 py-12 text-center md:px-20 md:pt-[72px] md:pb-12">
          <p className="font-mono text-[12px] tracking-[1px] text-[#1F6B43] uppercase">
            {info.eyebrow}
          </p>
          <h1 className="text-ink text-[32px] leading-[1.15] font-bold sm:text-[40px] md:text-[48px]">
            {info.title}
          </h1>
          <p className="text-text-muted max-w-[640px] text-[16px] leading-[1.6]">
            {info.subtitle}
          </p>
        </div>
      </section>

      {/* ContactBody — left form, right service-center info */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 py-12 md:px-20 md:py-16 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* LEFT — online enquiry form */}
          <div className="flex flex-col gap-4">
            <h2 className="text-ink text-[22px] font-bold">線上諮詢</h2>
            <ContactForm />
          </div>

          {/* RIGHT — service-center contact info cards */}
          <div className="flex flex-col gap-4">
            {info.centers.map((center) => (
              <div
                key={center.name}
                className="border-border bg-surface-muted flex flex-col gap-[10px] rounded-[14px] border p-6"
              >
                <h3 className="text-ink text-[16px] font-bold">
                  {center.name}
                </h3>
                <dl className="flex flex-col gap-[10px]">
                  {center.lines.map((line) => (
                    <div
                      key={`${line.label}-${line.value}`}
                      className="flex gap-[10px]"
                    >
                      <dt className="text-text-muted w-11 shrink-0 font-mono text-[12px] leading-[1.5]">
                        {line.label}
                      </dt>
                      <dd className="text-ink text-[14px] leading-[1.5]">
                        {line.href ? (
                          <a
                            href={line.href}
                            className="hover:text-primary-deep focus-visible:ring-primary-deep/40 rounded transition-colors outline-none focus-visible:ring-2"
                          >
                            {line.value}
                          </a>
                        ) : (
                          line.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
