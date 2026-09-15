// ERP 基本資料四區（品項／倉庫／廠商／客戶）共用的版面小元件。無 hooks，server / client 皆可用。
// 放在 items/_components（私有資料夾，不產生路由）；其他三區直接 import。
import Link from "next/link";
import type { ReactNode } from "react";

export const LINK_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white";
export const LINK_SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold";
export const TEXT_LINK = "text-ink hover:text-primary-deep font-medium";

export type MasterTab = "items" | "warehouses" | "vendors" | "customers";

const TABS: { key: MasterTab; label: string; href: string }[] = [
  { key: "items", label: "品項", href: "/admin/erp/items" },
  { key: "warehouses", label: "倉庫", href: "/admin/erp/warehouses" },
  { key: "vendors", label: "廠商", href: "/admin/erp/vendors" },
  { key: "customers", label: "客戶", href: "/admin/erp/customers" },
];

/** 基本資料頁內 tab（側欄只有一個「基本資料」入口）。 */
export function MasterTabs({ active }: { active: MasterTab }) {
  return (
    <nav
      aria-label="基本資料"
      className="border-border mb-6 flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-semibold whitespace-nowrap ${
              on
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MasterHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 break-words">
        <h1 className="text-ink text-[24px] font-bold">{title}</h1>
        {description && (
          <p className="text-text-muted mt-1 text-[14px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/** 表單欄位外框（label + 控制項）。 */
export function Field({
  label,
  htmlFor,
  required,
  wide,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  wide?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-ink text-[14px] font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-text-muted text-[12px]">{hint}</p>}
    </div>
  );
}

/** 詳情頁的欄位格。 */
export function InfoGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="border-border grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-white p-5 text-[14px] break-words sm:grid-cols-4">
      {children}
    </dl>
  );
}

export function Info({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-4" : ""}>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-ink whitespace-pre-wrap">{children ?? "—"}</dd>
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="bg-primary/10 text-primary-deep inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap">
      啟用
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-gray-500">
      停用
    </span>
  );
}

/** 統計卡（應收應付餘額等）。 */
export function StatCard({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="border-border rounded-xl border bg-white p-5">
      <p className="text-text-muted text-[13px]">{label}</p>
      <p className="text-ink mt-1 text-[22px] font-bold">{children}</p>
      {hint && <p className="text-text-muted mt-1 text-[12px]">{hint}</p>}
    </div>
  );
}

/** 列表分頁（GET query 保留其他篩選參數）。 */
export function Pager({
  basePath,
  params,
  page,
  total,
  pageSize,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="text-text-muted mt-4 flex items-center justify-between text-[14px]">
      <span>
        第 {page} / {pages} 頁，共 {total} 筆
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className={LINK_SECONDARY}>
            上一頁
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className={LINK_SECONDARY}>
            下一頁
          </Link>
        )}
      </div>
    </div>
  );
}

/** searchParams 單值（陣列取第一個）。 */
export function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(firstParam(v));
  return Number.isInteger(n) && n > 0 ? n : 1;
}
