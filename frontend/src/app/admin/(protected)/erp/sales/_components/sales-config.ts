// 銷售區段（報價單 / 銷貨單 / 銷退單）的路由與文字設定。純常數，client / server 皆可用。
import type { SalesDocType } from "@/lib/erp/queries/sales";

export const SALES_BASE_PATH: Record<SalesDocType, string> = {
  Q: "/admin/erp/quotes",
  S: "/admin/erp/sales",
  SR: "/admin/erp/sales-returns",
};

export const SALES_DOC_LABEL: Record<SalesDocType, string> = {
  Q: "報價單",
  S: "銷貨單",
  SR: "銷退單",
};

/** 過帳按鈕文字：報價單的過帳 = 「確認」（取號定稿）。 */
export const SALES_POST_LABEL: Record<SalesDocType, string> = {
  Q: "確認報價",
  S: "過帳",
  SR: "過帳",
};

export const SALES_TABS: SalesDocType[] = ["Q", "S", "SR"];

/** 單據列印頁（#178 建立）。 */
export function printHref(docId: string): string {
  return `/admin/erp/print/${docId}`;
}

export function maintenanceMachineHref(machineId: string): string {
  return `/admin/maintenance/${machineId}`;
}
