"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BRAND_NAME_CN, BRAND_NAME_EN } from "@/lib/brand";
import { PRIMARY_NAV, navHref, type NavSection } from "@/lib/nav-config";

function isActive(pathname: string, section: NavSection): boolean {
  // 未上線的 section 連到 /maintenance（多個共用），不高亮。
  if (!section.ready) return false;
  if (section.href === "/") return pathname === "/";
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

function Brand({ logoUrl }: { logoUrl: string }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-3"
      aria-label={BRAND_NAME_CN}
    >
      {/* 品牌 LOGO：後台可於「首頁與品牌設定」覆寫；未設定時退回內建素材。 */}
      <Image
        src={logoUrl}
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

export function Header({ logoUrl }: { logoUrl: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-border bg-surface sticky top-0 z-50 border-b">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-[18px] md:px-12">
        <Brand logoUrl={logoUrl} />

        {/* Desktop nav (語言切換 / 預約談話 CTA hidden for the interim launch) */}
        <nav className="hidden items-center gap-[22px] lg:flex">
          {PRIMARY_NAV.map((section) => (
            <Link
              key={section.key}
              href={navHref(section)}
              aria-current={isActive(pathname, section) ? "page" : undefined}
              className={`text-[18px] font-medium transition-colors ${
                isActive(pathname, section)
                  ? "text-ink"
                  : "text-text-muted hover:text-ink"
              }`}
            >
              {section.label}
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
            {PRIMARY_NAV.map((section) => (
              <li key={section.key}>
                <Link
                  href={navHref(section)}
                  onClick={() => setMenuOpen(false)}
                  aria-current={
                    isActive(pathname, section) ? "page" : undefined
                  }
                  className={`block py-3 text-[19px] font-medium transition-colors ${
                    isActive(pathname, section)
                      ? "text-ink"
                      : "text-text-muted hover:text-ink"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
