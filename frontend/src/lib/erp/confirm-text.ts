// ERP 確認框文字的純函式（client / 測試共用）。
// 採購區（#248 N-3）：採購單 P、進貨單 I、進退單 PR 共用 DocumentForm 與 DocActionBar，
// 但只有進貨／進退過帳才異動庫存；採購單過帳只取號（進貨單過帳時才入庫），作廢也不回沖庫存。
import type { DocType } from "./types";

export type PurchasingDocType = Extract<DocType, "P" | "I" | "PR">;

/** 「過帳」「儲存並過帳」確認框的說明文字。 */
export function purchasingPostConfirmMessage(
  docType: PurchasingDocType,
): string {
  if (docType === "P") {
    return "過帳後將取號，不異動庫存（進貨時入庫），只能以作廢撤銷。";
  }
  return "過帳後將取號並異動庫存，只能以作廢撤銷。";
}

/** 「確認作廢」確認框的說明文字（採購單另提醒：已有進貨單引用時 DB 會擋，需先作廢進貨單）。 */
export function purchasingVoidConfirmMessage(
  docType: PurchasingDocType,
): string {
  if (docType === "P") {
    return "採購單未異動庫存，作廢不影響庫存，單號不再使用；已有進貨單引用時需先作廢進貨單。";
  }
  return "庫存將回沖，單號不再使用。";
}
