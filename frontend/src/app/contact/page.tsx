import type { Metadata } from "next";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "聯絡我們",
  description:
    "與 AirExpert 超勁賀空壓科技聯繫。留下您的需求，專人將協助評估節能氣源系統與 ISO 50001 能源管理方案。",
};

// Contact info cards. TODO: replace PLACEHOLDER values with the client's real
// contact details before launch. `href` is null for non-linkable entries.
type ContactItem = {
  icon: LucideIcon;
  label: string;
  // Each line of the value (kept as an array so addresses can wrap cleanly).
  lines: string[];
  href: string | null;
};

const CONTACT_ITEMS: ContactItem[] = [
  {
    icon: Phone,
    label: "電話",
    // TODO: real phone number
    lines: ["+886 0-0000-0000（PLACEHOLDER）"],
    href: "tel:+8860000000000",
  },
  {
    icon: Mail,
    label: "Email",
    // TODO: real email address
    lines: ["info@example.com（PLACEHOLDER）"],
    href: "mailto:info@example.com",
  },
  {
    icon: MapPin,
    label: "地址",
    // TODO: real company address
    lines: ["000 台灣某縣市某區某路 000 號（PLACEHOLDER）"],
    href: null,
  },
  {
    icon: Clock,
    label: "營業時間",
    // TODO: confirm business hours
    lines: ["週一至週五 08:30 – 17:30（PLACEHOLDER）", "例假日休息"],
    href: null,
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Page header band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20 md:py-20">
          <p className="text-text-muted font-mono text-[12px] tracking-[1px] uppercase">
            CONTACT · 聯絡我們
          </p>
          <h1 className="text-ink mt-3 text-[30px] leading-[1.15] font-bold sm:text-[38px]">
            與我們談談您的氣源需求
          </h1>
          <p className="text-text-muted mt-4 max-w-[640px] text-[15px] leading-[1.65]">
            無論是新廠氣源規劃、設備汰換或能源診斷，留下您的需求，AirExpert
            專人將盡快與您聯繫，協助評估最合適的節能方案。
          </p>
        </div>
      </section>

      {/* Contact info + form */}
      <section className="bg-surface-muted">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 px-6 py-14 md:px-20 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
          {/* LEFT — company contact info */}
          <div className="flex flex-col gap-5">
            <h2 className="text-ink text-[20px] font-bold">聯絡資訊</h2>
            <ul className="flex flex-col gap-4">
              {CONTACT_ITEMS.map(({ icon: Icon, label, lines, href }) => (
                <li
                  key={label}
                  className="border-border bg-surface flex items-start gap-4 rounded-xl border p-5"
                >
                  <span className="border-border bg-surface-muted flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border">
                    <Icon
                      className="text-primary-deep h-5 w-5"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-text-muted text-[13px] font-medium">
                      {label}
                    </span>
                    {href ? (
                      <Link
                        href={href}
                        className="text-ink hover:text-primary-deep focus-visible:ring-primary-deep/40 rounded text-[15px] leading-[1.5] font-semibold transition-colors outline-none focus-visible:ring-2"
                      >
                        {lines.join(" ")}
                      </Link>
                    ) : (
                      lines.map((line) => (
                        <span
                          key={line}
                          className="text-ink text-[15px] leading-[1.5] font-semibold"
                        >
                          {line}
                        </span>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* RIGHT — contact form */}
          <div className="flex flex-col gap-4">
            <h2 className="text-ink text-[20px] font-bold">填寫需求表單</h2>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* Closing info row */}
      <section className="bg-surface-dark">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 px-6 py-14 md:flex-row md:items-center md:justify-between md:px-20">
          <div className="flex flex-col gap-2">
            <h2 className="text-[24px] font-bold text-white md:text-[28px]">
              想先了解我們的產品系列？
            </h2>
            <p className="text-text-on-dark-muted max-w-[560px] text-[15px] leading-[1.6]">
              從變頻空壓機到吸附式乾燥機，探索整合式氣源解決方案。
            </p>
          </div>
          <Link
            href="/products"
            className="bg-primary-deep focus-visible:ring-primary-soft/50 inline-flex shrink-0 items-center justify-center gap-2 rounded-[26px] px-7 py-[14px] text-[15px] font-semibold text-white transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            探索產品系列
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
