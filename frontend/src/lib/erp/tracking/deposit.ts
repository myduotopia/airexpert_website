// 交機進度「訂金」判斷（#272）。純函式，client / server 共用。
//
// 規則（有連結報價單或銷貨單時才自動判斷）：
//   1. 相關銷貨單已被收款沖銷（連結銷貨單 → 該張；連結報價單 → 由該報價單轉出的銷貨單；
//      只計已過帳銷貨單與已過帳收款）金額 > 0 → 已收；
//   2. 否則客戶有未沖銷預收（收款未沖銷且未退款的餘額）> 0 → 已收；
//   3. 否則 → 未收。
// 手動覆寫（deposit_override）一律優先；沒有連結單據且未手動設定 → 未收。
// 判斷依據的金額由 DB view delivery_jobs_view／delivery_document_options 算好（0038）。
import { formatMoney } from "@/lib/erp/format";
import type { DepositOverride, DepositStatus } from "./types";

export interface DepositFacts {
  hasDocument: boolean;
  /** 相關銷貨單已沖銷金額。 */
  linkedAllocated: number;
  /** 客戶未沖銷預收。 */
  customerPrepaid: number;
}

export interface AutoDeposit {
  status: DepositStatus;
  reason: string;
}

export interface DepositResolution {
  /** 最終顯示的訂金狀態。 */
  status: DepositStatus;
  /** manual = 手動覆寫；auto = 自動判斷；default = 無連結單據的預設（未收）。 */
  source: "manual" | "auto" | "default";
  /** 自動判斷結果（無連結單據為 null）。 */
  auto: DepositStatus | null;
  /** 判斷說明（顯示在表單）。 */
  reason: string;
}

/** 表單上的規則說明。 */
export const DEPOSIT_RULE_TEXT =
  "有連結單據時自動判斷：相關銷貨單（連結報價單時為由其轉出的銷貨單）已有收款沖銷，或客戶有未沖銷的預收款 → 已收；否則未收。可手動覆寫。";

export function autoDeposit(facts: DepositFacts): AutoDeposit | null {
  if (!facts.hasDocument) return null;
  if (facts.linkedAllocated > 0) {
    return {
      status: "received",
      reason: `相關銷貨單已沖銷 ${formatMoney(facts.linkedAllocated)} 元`,
    };
  }
  if (facts.customerPrepaid > 0) {
    return {
      status: "received",
      reason: `客戶有未沖銷預收 ${formatMoney(facts.customerPrepaid)} 元`,
    };
  }
  return {
    status: "not_received",
    reason: "相關銷貨單尚無沖銷，客戶也沒有預收款",
  };
}

export function resolveDeposit(
  override: DepositOverride,
  facts: DepositFacts,
): DepositResolution {
  const auto = autoDeposit(facts);
  if (override) {
    return {
      status: override,
      source: "manual",
      auto: auto?.status ?? null,
      reason: auto ? `手動設定（自動判斷：${auto.reason}）` : "手動設定",
    };
  }
  if (auto) {
    return {
      status: auto.status,
      source: "auto",
      auto: auto.status,
      reason: auto.reason,
    };
  }
  return {
    status: "not_received",
    source: "default",
    auto: null,
    reason: "未連結單據，請手動設定",
  };
}
