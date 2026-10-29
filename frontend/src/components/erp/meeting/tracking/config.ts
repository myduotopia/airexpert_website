// 週報追蹤清單（#272）三個子頁籤（交機進度／進廠維修／新機問題）的頁面設定：篩選選項與說明文字。
// 純常數，週報頁與列印頁共用。
import type { EmployeeRole } from "@/lib/employees/types";
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  MACHINE_ISSUE_STATUSES,
  MACHINE_ISSUE_STATUS_LABELS,
  REPAIR_STATUSES,
  REPAIR_STATUS_LABELS,
  type TrackingKind,
} from "@/lib/erp/tracking/types";

export interface TrackingPageConfig {
  statuses: { value: string; label: string }[];
  statusLabels: Record<string, string>;
  /** 負責人篩選列出哪些角色的在職員工。 */
  roles: EmployeeRole[];
  ownerLabel: string;
  /** owner=none 的文字。 */
  noneLabel: string;
  keywordPlaceholder: string;
  /** 清單說明（日期區間依據等）。 */
  note: string;
}

function choices<S extends string>(
  list: readonly S[],
  labels: Record<S, string>,
): { value: string; label: string }[] {
  return list.map((s) => ({ value: s, label: labels[s] }));
}

export const TRACKING_PAGE_CONFIG: Record<TrackingKind, TrackingPageConfig> = {
  delivery: {
    statuses: choices(DELIVERY_STATUSES, DELIVERY_STATUS_LABELS),
    statusLabels: DELIVERY_STATUS_LABELS,
    roles: ["sales", "technician"],
    ownerLabel: "負責人（業務或交機）",
    noneLabel: "交機負責人待確認",
    keywordPlaceholder: "客戶、機器設備、注意事項、單號",
    note: "期間依交機時間（與期間重疊者）；交機時間待確認者一律列出，排在最後。訂金「依客戶預收」表示客戶有未沖銷預收款（客戶層級），未必是此筆訂金。",
  },
  repairs: {
    statuses: choices(REPAIR_STATUSES, REPAIR_STATUS_LABELS),
    statusLabels: REPAIR_STATUS_LABELS,
    roles: ["technician"],
    ownerLabel: "負責人",
    noneLabel: "負責人未指定",
    keywordPlaceholder: "客戶、機型、問題、負責人",
    note: "期間依進廠日期；由舊到新（等最久的在前）。",
  },
  "machine-issues": {
    statuses: choices(MACHINE_ISSUE_STATUSES, MACHINE_ISSUE_STATUS_LABELS),
    statusLabels: MACHINE_ISSUE_STATUS_LABELS,
    roles: ["technician"],
    ownerLabel: "負責人",
    noneLabel: "負責人未指定",
    keywordPlaceholder: "客戶、機型、機號、問題、負責人",
    note: "期間依發生日期；重點追蹤排在最前並以醒目底色顯示。",
  },
};
