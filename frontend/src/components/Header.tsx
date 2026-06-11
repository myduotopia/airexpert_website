"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";

type NavItem = {
  label: string;
  href: string;
};

// Interim launch nav. 首頁 → home, 公司活動 → /events, 聯絡我們 → /contact;
// the remaining sections link to /maintenance while their content is updated.
const NAV_ITEMS: NavItem[] = [
  { label: "首頁", href: "/" },
  { label: "商品介紹", href: "/maintenance" },
  { label: "最新消息", href: "/maintenance" },
  { label: "服務項目", href: "/maintenance" },
  { label: "加入時機", href: "/maintenance" },
  { label: "公司活動", href: "/events" },
  { label: "聯絡我們", href: "/contact" },
];

function isActive(pathname: string, href: string): boolean {
  // Don't highlight the shared /maintenance links (several map to it).
  if (href === "/maintenance") return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3"
      aria-label={BRAND_NAME_CN}
    >
      {/* Official 超勁賀 brand mark (blue), from the company logo artwork. */}
      <Image
        src="/brand/logo-mark.png"
        alt=""
        width={150}
        height={99}
        priority
        className="h-[46px] w-auto"
      />
      <span className="flex flex-col gap-1 leading-tight">
        <span className="text-ink text-[28px] leading-none font-bold">
          {BRAND_NAME_CN}
        </span>
        <span className="text-text-muted font-mono text-[14px] tracking-[0.5px]">
          {BRAND_NAME_EN}
        </span>
      </span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-border bg-surface sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-[18px] md:px-12">
        <Brand />

        {/* Desktop nav (語言切換 / 預約談話 CTA hidden for the interim launch) */}
        <nav className="hidden items-center gap-[22px] lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`text-[18px] font-medium transition-colors ${
                isActive(pathname, item.href)
                  ? "text-ink"
                  : "text-text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "關閉選單" : "開啟選單"}
          className="text-ink inline-flex h-10 w-10 items-center justify-center lg:hidden"
        >
          {menuOpen ? (
            <X size={22} aria-hidden="true" />
          ) : (
            <Menu size={22} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          id="mobile-nav"
          className="border-border bg-surface border-t lg:hidden"
        >
          <ul className="mx-auto flex max-w-[1440px] flex-col px-6 py-2 md:px-12">
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={
                    isActive(pathname, item.href) ? "page" : undefined
                  }
                  className={`block py-3 text-[19px] font-medium transition-colors ${
                    isActive(pathname, item.href)
                      ? "text-ink"
                      : "text-text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
