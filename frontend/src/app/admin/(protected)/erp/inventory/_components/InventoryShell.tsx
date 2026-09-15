// 庫存區殼層：標題 + 頁內 tab（存量／機號／異動明細／調撥單／盤點調整）。server component。
import Link from "next/link";
import type { ReactNode } from "react";

export type InventoryTabKey =
  | "levels"
  | "serials"
  | "moves"
  | "transfers"
  | "adjustments";

const TABS: { key: InventoryTabKey; label: string; href: string }[] = [
  { key: "levels", label: "存量", href: "/admin/erp/inventory" },
  { key: "serials", label: "機號", href: "/admin/erp/inventory/serials" },
  { key: "moves", label: "異動明細", href: "/admin/erp/inventory/moves" },
  { key: "transfers", label: "調撥單", href: "/admin/erp/transfers" },
  { key: "adjustments", label: "盤點調整", href: "/admin/erp/adjustments" },
];

export function InventoryShell({
  active,
  description,
  actions,
  children,
}: {
  active: InventoryTabKey;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-[24px] font-bold">庫存</h1>
          {description && (
            <p className="text-text-muted mt-1 text-[14px]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav
        className="border-border mb-5 flex gap-1 overflow-x-auto border-b"
        aria-label="庫存功能"
      >
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-4 text-[14px] font-semibold ${
                isActive
                  ? "border-primary text-primary-deep"
                  : "text-text-muted hover:text-ink border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export const PRIMARY_LINK =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white";
export const SECONDARY_LINK =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold";
export const TABLE_WRAP =
  "border-border overflow-x-auto rounded-xl border bg-white";
export const TH = "px-3 py-2 font-medium whitespace-nowrap";
export const TD = "px-3 py-2 align-top";
