import Link from "next/link";
import { Leaf } from "lucide-react";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";
import { MAINTENANCE_HREF } from "@/lib/nav-config";

// Footer — sitemap 樣式（依 wholenewhome 2.pen frame HeGjg）：品牌 + ISO 徽章 +
// 產品 / 公司 / 永續 三欄連結 + 版權列。聯絡資訊已移至首頁 Contact 區與 /contact，
// 故 footer 不再重複聯絡方式。尚未上線的頁面連往 /maintenance（沿用 nav 慣例）。
type FooterLink = { label: string; href: string };
type FooterColumn = { title: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    title: "產品",
    links: [
      { label: "空氣壓縮機", href: "/products?category=變頻空壓機" },
      { label: "真空泵浦", href: "/products?category=變頻真空泵" },
      { label: "鼓風機", href: "/products?category=變頻鼓風機" },
      { label: "乾燥機", href: "/products?category=冷凍式乾燥機" },
    ],
  },
  {
    title: "公司",
    links: [
      { label: "關於我們", href: MAINTENANCE_HREF },
      { label: "最新消息", href: "/news" },
      { label: "技術文獻", href: MAINTENANCE_HREF },
      { label: "聯絡我們", href: "/contact" },
    ],
  },
  {
    title: "永續",
    links: [
      { label: "ESG 報告", href: MAINTENANCE_HREF },
      { label: "能源管理", href: "/services" },
      { label: "碳足跡", href: MAINTENANCE_HREF },
      { label: "循環經濟", href: MAINTENANCE_HREF },
    ],
  },
];

const FOOTER_DESC =
  "以節能氣源系統推動永續製造。導入 ISO 50001 能源管理，協助產業邁向淨零目標。";
const COPYRIGHT = "© 2026 JIN HE & CHAO HE AIR COMPRESSOR CO., LTD.";
const LEGAL = "隱私權政策 · 使用條款 · ISO 9001 / ISO 50001";

export function Footer() {
  return (
    <footer className="bg-surface-dark border-border-dark border-t text-white">
      {/* Top：品牌 + sitemap */}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-6 pt-14 pb-10 md:flex-row md:justify-between md:px-20">
        {/* 品牌欄 */}
        <div className="flex max-w-[340px] flex-col gap-4">
          <div className="flex flex-col gap-1 leading-tight">
            <span className="text-[18px] font-bold text-white">
              {BRAND_NAME_CN}
            </span>
            <span className="text-text-on-dark-muted font-mono text-[11px] tracking-[0.5px]">
              {BRAND_NAME_EN}
            </span>
          </div>
          <p className="text-text-on-dark-muted text-[13px] leading-[1.6]">
            {FOOTER_DESC}
          </p>
          <span className="bg-surface-dark-2 inline-flex w-fit items-center gap-2 rounded-[20px] px-3 py-1.5">
            <Leaf size={14} className="text-primary-soft" aria-hidden="true" />
            <span className="text-primary-soft font-mono text-[10px] tracking-[0.5px]">
              ISO 50001 · NET-ZERO READY
            </span>
          </span>
        </div>

        {/* sitemap 連結欄 */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 md:gap-x-16">
          {COLUMNS.map((col) => (
            <nav
              key={col.title}
              aria-label={col.title}
              className="flex flex-col gap-3"
            >
              <p className="text-[13px] font-semibold text-white">
                {col.title}
              </p>
              {col.links.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-text-on-dark-muted hover:text-primary-soft text-[13px] transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-border-dark border-t">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-20">
          <p className="text-text-on-dark-muted font-mono text-[11px] tracking-[0.5px]">
            {COPYRIGHT}
          </p>
          <p className="text-text-on-dark-muted text-[12px]">{LEGAL}</p>
        </div>
      </div>
    </footer>
  );
}
