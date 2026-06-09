import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";

type FooterLink = {
  label: string;
  href: string;
};

type FooterColumn = {
  heading: string;
  links: FooterLink[];
};

const BRAND_DESCRIPTION =
  "以節能氣源系統推動永續製造。導入 ISO 50001 能源管理，協助產業邁向淨零目標。";
const ISO_BADGE_LABEL = "ISO 50001 · NET-ZERO READY";
const COPYRIGHT = "© 2026 JIN HE & CHAO HE AIR COMPRESSOR CO., LTD.";

// Footer link columns (exact items from SKILL.md "Footer"). Hrefs point at the
// intended routes; most target pages do not exist yet (404 is fine for now).
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "產品",
    links: [
      { label: "空氣壓縮機", href: "/products" },
      { label: "真空泵浦", href: "/products" },
      { label: "鼓風機", href: "/products" },
      { label: "乾燥機", href: "/products" },
    ],
  },
  {
    heading: "公司",
    links: [
      { label: "關於我們", href: "/about" },
      { label: "最新消息", href: "/news" },
      { label: "技術文獻", href: "/tech" },
      { label: "聯絡我們", href: "/contact" },
    ],
  },
  {
    heading: "永續",
    links: [
      { label: "ESG 報告", href: "/sustainability" },
      { label: "能源管理", href: "/sustainability" },
      { label: "碳足跡", href: "/sustainability" },
      { label: "循環經濟", href: "/sustainability" },
    ],
  },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: "隱私權政策", href: "/privacy" },
  { label: "使用條款", href: "/terms" },
  { label: "ISO 9001 / ISO 50001", href: "/sustainability" },
];

// Inline leaf icon (lucide `leaf` path) — kept inline to avoid adding the
// lucide-react dependency for a single decorative glyph.
function LeafIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function BrandColumn() {
  return (
    <div className="max-w-[360px]">
      <div className="flex items-center gap-3">
        {/* Soft-green logo on dark bg uses primary-soft token. */}
        <Logo className="text-primary-soft" />
        <span className="flex flex-col leading-tight">
          <span className="text-[17px] leading-none font-bold text-white">
            {BRAND_NAME_CN}
          </span>
          <span className="text-text-on-dark-muted font-mono text-[8px] tracking-[0.5px]">
            {BRAND_NAME_EN}
          </span>
        </span>
      </div>

      <p className="text-text-on-dark-muted mt-5 text-[13px] leading-[1.6]">
        {BRAND_DESCRIPTION}
      </p>

      <div className="bg-surface-dark-2 mt-5 inline-flex items-center gap-2 rounded-[20px] px-3 py-1.5">
        <LeafIcon className="text-primary-soft" />
        <span className="text-primary-soft font-mono text-[10px] tracking-[0.5px]">
          {ISO_BADGE_LABEL}
        </span>
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-surface-dark text-white">
      {/* Top */}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-6 pt-14 pb-10 md:px-12 lg:flex-row lg:justify-between">
        <BrandColumn />

        <div className="flex flex-col gap-10 sm:flex-row sm:gap-16">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="text-[13px] font-semibold text-white">
                {column.heading}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link, index) => (
                  <li key={`${link.label}-${index}`}>
                    <Link
                      href={link.href}
                      className="text-text-on-dark-muted text-[13px] transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-border-dark border-t">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-12">
          <p className="text-text-on-dark-muted font-mono text-[11px] tracking-[0.5px]">
            {COPYRIGHT}
          </p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-text-on-dark-muted text-[12px] transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
