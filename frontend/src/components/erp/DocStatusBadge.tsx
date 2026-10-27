// 單據狀態標籤（草稿 / 已過帳 / 已作廢；報價單已過帳顯示「已確認」）。樣式同後台 StatusBadge。
import { docStatusLabel } from "@/lib/erp/display";
import type { DocStatus, DocType } from "@/lib/erp/types";

const STYLES: Record<DocStatus, string> = {
  draft: "bg-amber-100 text-amber-700",
  posted: "bg-primary/10 text-primary-deep",
  voided: "bg-gray-100 text-gray-500",
};

/** 不分單別的通用狀態文字（調撥、盤點等篩選用）；報價單請用 docStatusLabel(s, "Q")。 */
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: docStatusLabel("draft"),
  posted: docStatusLabel("posted"),
  voided: docStatusLabel("voided"),
};

export function DocStatusBadge({
  status,
  docType,
  label,
}: {
  status: DocStatus;
  /** 單別：報價單 Q 的 posted 顯示「已確認」（#241 A-5）。 */
  docType?: DocType | null;
  /** 覆寫顯示文字（樣式仍依 status），例：相關單據區塊由 activityRowView 決定文字。 */
  label?: string;
}) {
  const known = Object.hasOwn(STYLES, status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${STYLES[known ? status : "draft"]}`}
    >
      {label ?? docStatusLabel(known ? status : "draft", docType)}
    </span>
  );
}
