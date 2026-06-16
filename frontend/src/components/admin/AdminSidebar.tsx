"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin/nav-config";
import { logoutAction } from "@/app/admin/actions";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="border-border bg-surface flex w-[230px] shrink-0 flex-col border-r">
      <div className="border-border border-b px-5 py-4">
        <p className="text-ink text-[16px] font-bold">超勁賀 後台</p>
        <p className="text-text-muted mt-0.5 truncate text-[12px]">{email}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-0.5">
          {ADMIN_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            if (!item.enabled) {
              return (
                <li key={item.key}>
                  <span
                    aria-disabled="true"
                    title="尚未開放"
                    className="text-text-muted/50 block cursor-not-allowed rounded-md px-3 py-2 text-[14px]"
                  >
                    {item.label}
                  </span>
                </li>
              );
            }
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-[14px] transition-colors ${
                    active
                      ? "bg-surface-muted text-primary-deep font-semibold"
                      : "text-ink hover:bg-surface-muted"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action={logoutAction} className="border-border border-t p-3">
        <button
          type="submit"
          className="text-text-muted hover:text-ink w-full rounded-md px-3 py-2 text-left text-[14px] transition-colors"
        >
          登出
        </button>
      </form>
    </aside>
  );
}
