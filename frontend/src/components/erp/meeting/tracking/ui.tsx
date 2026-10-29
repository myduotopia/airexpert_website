// 週報追蹤清單（#272）共用的小元件與樣式。無 hooks，server / client 皆可用。
import type { ReactNode } from "react";
import type { CustomerOption } from "@/lib/erp/types";

export const TH =
  "border-border text-text-muted border-b px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap print:px-1.5 print:py-1 print:text-[11px] print:text-black";
export const TD =
  "border-border text-ink border-b px-3 py-2 align-top text-[14px] print:px-1.5 print:py-1 print:text-[11px]";
export const TABLE =
  "w-full border-collapse text-left print:border print:border-gray-400";
export const ROW_ACTION =
  "text-primary-deep hover:text-ink text-[13px] font-semibold whitespace-nowrap";
export const BTN_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-50";
export const BTN_SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold disabled:opacity-50";
export const BTN_DANGER =
  "inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";
/** 重點追蹤列的醒目底色（列印時保留顏色）。 */
export const KEY_ROW = "bg-amber-100 print:bg-amber-100";

/** 「待確認」紅字。 */
export function PendingText({ children = "待確認" }: { children?: ReactNode }) {
  return <span className="font-semibold text-red-600">{children}</span>;
}

export function StatusBadge({
  label,
  closed,
}: {
  label: string;
  closed: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${
        closed ? "bg-gray-100 text-gray-500" : "bg-primary/10 text-primary-deep"
      } print:bg-transparent print:p-0 print:text-black`}
    >
      {label}
    </span>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-ink text-[20px] font-bold">{title}</h2>
        {description && (
          <p className="text-text-muted mt-1 text-[13px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/** 表單欄位外框（label + 控制項 + 錯誤）。 */
export function FormField({
  label,
  htmlFor,
  required,
  wide,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  wide?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="text-ink text-[14px] font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      )}
      {hint && <div className="text-text-muted text-[12px]">{hint}</div>}
    </div>
  );
}

/** 顯示客戶（編號 + 名稱）。 */
export function customerLabel(code: string | null, name: string): string {
  return code ? `${code} ${name}` : name;
}

/**
 * 客戶選項 + 目前資料列上的客戶（停用客戶不在選項中時補上，編輯時才顯示得出名稱）。
 */
export function withCurrentCustomer(
  options: CustomerOption[],
  current: { id: string; code: string | null; name: string } | null,
): CustomerOption[] {
  if (!current || options.some((o) => o.id === current.id)) return options;
  return [
    {
      id: current.id,
      code: current.code,
      name: current.name,
      tax_id: null,
      contact_person: null,
      phone: null,
      address: null,
      delivery_address: null,
      payment_terms: null,
      sales_rep: null,
      sales_rep_id: null,
    },
    ...options,
  ];
}
