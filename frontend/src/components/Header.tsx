"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";

type NavItem = {
  label: string;
  href: string;
};

// Interim launch nav. The non-home items redirect to /maintenance
// (see next.config.ts) while their content is being updated.
const NAV_ITEMS: NavItem[] = [
  { label: "首頁", href: "/" },
  { label: "產品系列", href: "/products" },
  { label: "解決方案", href: "/services" },
  { label: "技術文獻", href: "/tech" },
  { label: "最新消息", href: "/news" },
  { label: "關於", href: "/about" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3">
      {/* Green logo mark on light bg uses primary-deep token. 1.3× the base size. */}
      <Logo className="text-primary-deep" width={52} height={34} />
      <span className="flex flex-col leading-tight">
        <span className="text-ink text-[22px] leading-none font-bold">
          {BRAND_NAME_CN}
        </span>
        <span className="text-text-muted font-mono text-[10px] tracking-[0.5px]">
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
        </nav>
      )}
    </header>
  );
}
