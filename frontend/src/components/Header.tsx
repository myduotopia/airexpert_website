"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";

type NavItem = {
  label: string;
  href: string;
};

// Nav IA is the design's simplified menu (see SKILL.md "Nav"). Labels are
// mapped to intended routes; most target pages do not exist yet (404 is fine).
const NAV_ITEMS: NavItem[] = [
  { label: "首頁", href: "/" },
  { label: "產品系列", href: "/products" },
  { label: "解決方案", href: "/services" },
  { label: "技術文獻", href: "/tech" },
  { label: "最新消息", href: "/news" },
  { label: "關於", href: "/about" },
];

const CTA_LABEL = "預約談話";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      {/* Green logo mark on light bg uses primary-deep token. */}
      <Logo className="text-primary-deep" />
      <span className="flex flex-col leading-tight">
        <span className="text-ink text-[17px] leading-none font-bold">
          {BRAND_NAME_CN}
        </span>
        <span className="text-text-muted font-mono text-[8px] tracking-[0.5px]">
          {BRAND_NAME_EN}
        </span>
      </span>
    </Link>
  );
}

function LanguageSwitch() {
  // TODO: wire to real i18n once locale routing exists. Static, visual-only for
  // now — presented as a labelled group rather than a misleading aria-current.
  return (
    <div
      className="flex items-center gap-1 text-[13px]"
      aria-label="目前語言：中文"
    >
      <span className="text-ink font-semibold">中</span>
      <span className="text-border" aria-hidden="true">
        /
      </span>
      <span className="text-text-muted">EN</span>
    </div>
  );
}

function CtaPill({ className }: { className?: string }) {
  return (
    <Link
      href="/contact"
      className={`bg-primary-deep inline-flex items-center justify-center rounded-3xl px-[18px] py-[10px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 ${className ?? ""}`}
    >
      {CTA_LABEL}
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

        {/* Desktop nav */}
        <nav className="hidden items-center gap-[30px] lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`text-[14px] font-medium transition-colors ${
                isActive(pathname, item.href)
                  ? "text-ink"
                  : "text-text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop right cluster */}
        <div className="hidden items-center gap-[18px] lg:flex">
          <LanguageSwitch />
          <CtaPill />
        </div>

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
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
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
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={
                    isActive(pathname, item.href) ? "page" : undefined
                  }
                  className={`block py-3 text-[15px] font-medium transition-colors ${
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
          <div className="border-border mx-auto flex max-w-[1440px] items-center justify-between gap-4 border-t px-6 py-4 md:px-12">
            <LanguageSwitch />
            <CtaPill className="flex-1" />
          </div>
        </nav>
      )}
    </header>
  );
}
