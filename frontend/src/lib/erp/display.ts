// ERP 畫面顯示用的純函式（client / server / 測試共用）：單據狀態文字、編輯頁合計區的列。
import type { DocumentTotals } from "./calc";
import type { DocStatus, DocType, TaxType } from "./types";

const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "草稿",
  posted: "已過帳",
  voided: "已作廢",
};

/**
 * 單據狀態文字（#241 A-5）：報價單的「過帳」在畫面上是「確認報價」（取號定稿、不異動庫存），
 * 故報價單 posted 顯示「已確認」；其他單別維持「已過帳」。未指定單別時用通用文字。
 */
export function docStatusLabel(
  status: DocStatus,
  docType?: DocType | null,
): string {
  if (status === "posted" && docType === "Q") return "已確認";
  return STATUS_LABEL[status] ?? status;
}

export interface TotalsSummaryRow {
  key: "untaxed" | "tax" | "total" | "twd";
  label: string;
  amount: number;
  currency: string;
  /** 總計列加粗。 */
  strong?: true;
  /** 外幣總計顯示幣別。 */
  showCurrency?: true;
}

const TAX_NOTE: Record<TaxType, string> = {
  excluded: "外加",
  included: "內含",
  exempt: "免稅",
};

/**
 * 編輯頁合計區的列（#241 B-09）：標籤與數字一致，與詳情頁相同為「合計（未稅）」「稅額」「總計」。
 * 稅別寫在稅額標籤（例「稅額（內含 5%）」），不再把「內含」掛在顯示未稅額的合計上。
 * 外幣另列「折合台幣」。
 */
export function totalsSummaryRows(
  totals: Pick<
    DocumentTotals,
    "amount_untaxed" | "tax_amount" | "total_amount" | "total_twd"
  >,
  opts: { taxType: TaxType; taxRate: number; currency: string },
): TotalsSummaryRow[] {
  const { taxType, taxRate, currency } = opts;
  const taxNote =
    taxType === "exempt"
      ? TAX_NOTE.exempt
      : `${TAX_NOTE[taxType]} ${Math.round(Number(taxRate) * 10000) / 100}%`;
  const foreign = currency !== "TWD";
  const rows: TotalsSummaryRow[] = [
    {
      key: "untaxed",
      label: "合計（未稅）",
      amount: totals.amount_untaxed,
      currency,
    },
    {
      key: "tax",
      label: `稅額（${taxNote}）`,
      amount: totals.tax_amount,
      currency,
    },
    {
      key: "total",
      label: "總計",
      amount: totals.total_amount,
      currency,
      strong: true,
      ...(foreign ? { showCurrency: true as const } : {}),
    },
  ];
  if (foreign) {
    rows.push({
      key: "twd",
      label: "折合台幣",
      amount: totals.total_twd,
      currency: "TWD",
    });
  }
  return rows;
}
