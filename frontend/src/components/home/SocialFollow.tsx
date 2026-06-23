import { Facebook, MessageCircle } from "lucide-react";
import type { HomeSocial } from "@/lib/data/home";

// 追蹤我們 — 標題與服務中心卡片皆來自 site_settings `home_social`。
export function SocialFollow({ content }: { content: HomeSocial }) {
  return (
    <section className="bg-surface border-border border-t">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[30px] font-bold sm:text-[38px]">
            {content.title}
          </h2>
          <p className="text-text-muted max-w-[560px] text-[17px] leading-[1.6]">
            {content.description}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {content.companies.map((c) => (
            <div
              key={c.name}
              className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-7"
            >
              <div className="flex flex-col gap-1">
                <p className="text-text-muted font-mono text-[13px] tracking-[0.5px]">
                  {c.region}
                </p>
                <h3 className="text-ink text-[20px] font-semibold">{c.name}</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={c.line}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${c.name} LINE 官方帳號`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#06C755] px-5 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  LINE 官方帳號
                </a>
                <a
                  href={c.fb}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${c.name} Facebook 粉絲專頁`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-5 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Facebook className="h-5 w-5" aria-hidden="true" />
                  粉絲專頁
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
