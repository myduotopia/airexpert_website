// 單據狀態標籤（草稿 / 已過帳 / 已作廢）。樣式同後台 StatusBadge。
import type { DocStatus } from "@/lib/erp/types";

const STYLES: Record<DocStatus, { label: string; className: string }> = {
  draft: { label: "草稿", className: "bg-amber-100 text-amber-700" },
  posted: { label: "已過帳", className: "bg-primary/10 text-primary-deep" },
  voided: { label: "已作廢", className: "bg-gray-100 text-gray-500" },
};

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: STYLES.draft.label,
  posted: STYLES.posted.label,
  voided: STYLES.voided.label,
};

export function DocStatusBadge({ status }: { status: DocStatus }) {
  const s = STYLES[status] ?? STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${s.className}`}
    >
      {s.label}
    </span>
  );
}
