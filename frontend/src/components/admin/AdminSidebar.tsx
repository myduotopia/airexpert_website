"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref, navForRole } from "@/lib/admin/nav-config";
import type { AdminRole } from "@/lib/admin/auth";
import { logoutAction } from "@/app/admin/actions";

export function AdminSidebar({
  email,
  role,
}: {
  email: string;
  role: AdminRole;
}) {
  const pathname = usePathname();
  const nav = navForRole(role);
  const activeHref = activeNavHref(
    pathname,
    nav.filter((i) => i.enabled).map((i) => i.href),
  );
  // 行動版（< lg）側欄改為抽屜：預設收起，漢堡鈕開啟、點連結 / 遮罩 / 關閉鈕關閉。
  // lg 以上維持靜態欄位，行為與原本一致。
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 行動版漢堡鈕：僅 < lg 顯示，固定於左上。 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="開啟選單"
        aria-expanded={open}
        aria-controls="admin-sidebar-drawer"
        className="border-border bg-surface text-ink fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm lg:hidden"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* 行動版遮罩：抽屜開啟時顯示，點擊關閉。 */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        id="admin-sidebar-drawer"
        className={`border-border bg-surface fixed inset-y-0 left-0 z-50 flex w-[230px] shrink-0 flex-col border-r transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-border flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-ink text-[16px] font-bold">超勁賀 後台</p>
            <p className="text-text-muted mt-0.5 truncate text-[12px]">
              {email}
            </p>
          </div>
          {/* 行動版關閉鈕（lg 以上隱藏）。 */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="關閉選單"
            className="text-text-muted hover:text-ink -mr-1 shrink-0 rounded-md p-1 lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {nav.map((item) => {
              const active = item.href === activeHref;
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
                    onClick={() => setOpen(false)}
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
    </>
  );
}
