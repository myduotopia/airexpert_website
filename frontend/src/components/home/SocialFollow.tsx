import type { ReactNode } from "react";
import {
  Facebook,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import type { HomeSocial } from "@/lib/data/home";
import { HOME_CONTACT_DETAILS } from "@/components/home/content";

// Contact — 與我們保持聯繫。標題與服務中心（region/name/LINE/FB）來自 site_settings
// `home_social`；電話 / 地址 / email 等細節取自 content.ts（依 region 對應）。
function ContactRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        size={16}
        className="text-primary-deep shrink-0"
        aria-hidden="true"
      />
      <span className="text-ink text-[15px]">{children}</span>
    </div>
  );
}

export function SocialFollow({ content }: { content: HomeSocial }) {
  return (
    <section className="bg-surface border-border border-b">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-6 py-16 md:px-20 md:py-[72px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[28px] font-extrabold sm:text-[34px]">
            {content.title}
          </h2>
          <p className="text-text-muted max-w-[600px] text-[16px] leading-[1.6]">
            {content.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {content.companies.map((c) => {
            const detail = HOME_CONTACT_DETAILS[c.region];
            return (
              <div
                key={c.name}
                className="border-border bg-surface-muted flex flex-col gap-6 rounded-[18px] border p-8"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-primary-deep font-mono text-[12px] tracking-[0.5px]">
                    {c.region}
                  </p>
                  <h3 className="text-ink text-[24px] font-bold">{c.name}</h3>
                </div>

                {detail ? (
                  <div className="flex flex-col gap-3">
                    <ContactRow icon={PhoneCall}>
                      免付費 {detail.tollFree}
                    </ContactRow>
                    <ContactRow icon={Phone}>{detail.phone}</ContactRow>
                    <ContactRow icon={MapPin}>{detail.address}</ContactRow>
                    <ContactRow icon={Mail}>
                      <a
                        href={`mailto:${detail.email}`}
                        className="hover:text-primary-deep break-all"
                      >
                        {detail.email}
                      </a>
                    </ContactRow>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={c.line}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${c.name} LINE 官方帳號`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06C755] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    LINE 官方帳號
                  </a>
                  <a
                    href={c.fb}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${c.name} Facebook 粉絲專頁`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-5 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Facebook className="h-5 w-5" aria-hidden="true" />
                    粉絲專頁
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
