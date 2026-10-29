// 週報追蹤清單（#272）的 CSV 表格（標題列 + 資料列）。純函式；字串化（BOM、跳脫）交給 toCsv。
// 欄位與畫面清單一致；日期一律完整西元 YYYY-MM-DD（Excel 可排序），處理進度為最新一筆。
import type { CsvCell } from "@/lib/erp/reports";
import { resolveDeposit } from "./deposit";
import {
  formatDeliveryWindow,
  formatTrackingDate,
  latestProgressText,
} from "./display";
import {
  DELIVERY_STATUS_LABELS,
  DEPOSIT_LABELS,
  MACHINE_ISSUE_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  type DeliveryJobRow,
  type MachineIssueRow,
  type RepairJobRow,
  type TrackingKind,
} from "./types";

export interface CsvTable {
  headers: string[];
  rows: CsvCell[][];
}

/** 各類別名稱（報表標題、檔名）。 */
export const TRACKING_TITLES: Record<TrackingKind, string> = {
  delivery: "交機進度",
  repairs: "進廠維修",
  "machine-issues": "新機問題",
};

export function deliveryDeposit(row: DeliveryJobRow) {
  return resolveDeposit(row.deposit_override, {
    hasDocument: row.document_id !== null,
    linkedAllocated: Number(row.linked_allocated) || 0,
    customerPrepaid: Number(row.customer_prepaid) || 0,
  });
}

export function deliveryCsvTable(rows: DeliveryJobRow[]): CsvTable {
  return {
    headers: [
      "客戶",
      "訂金",
      "負責業務",
      "交機負責人",
      "材料確認",
      "機器設備",
      "交機時間",
      "注意事項",
      "狀態",
      "來源單據",
    ],
    rows: rows.map((r) => [
      r.customer_name,
      DEPOSIT_LABELS[deliveryDeposit(r).status],
      r.sales_rep_name ?? "",
      r.delivery_owner_name ?? "待確認",
      r.materials_confirmed ? "已確認" : "未確認",
      r.equipment ?? "",
      formatDeliveryWindow(r.delivery_start, r.delivery_end, null).text,
      r.note ?? "",
      DELIVERY_STATUS_LABELS[r.status] ?? r.status,
      r.doc_no ?? "",
    ]),
  };
}

export function repairsCsvTable(rows: RepairJobRow[]): CsvTable {
  return {
    headers: ["客戶", "進廠日期", "機型", "問題", "處理進度", "負責人", "狀態"],
    rows: rows.map((r) => [
      r.customer_name,
      formatTrackingDate(r.received_on, null),
      r.model ?? "",
      r.description,
      latestProgressText(r.latest_progress_date, r.latest_progress, null),
      r.owner_name ?? "",
      REPAIR_STATUS_LABELS[r.status] ?? r.status,
    ]),
  };
}

export function machineIssuesCsvTable(rows: MachineIssueRow[]): CsvTable {
  return {
    headers: [
      "客戶",
      "交機日期",
      "機型",
      "機號",
      "問題",
      "發生日期",
      "處理進度",
      "負責人",
      "狀態",
      "重點追蹤",
    ],
    rows: rows.map((r) => [
      r.customer_name,
      formatTrackingDate(r.delivered_on, null),
      r.model ?? "",
      r.machine_serial_no ?? "",
      r.description,
      formatTrackingDate(r.occurred_on, null),
      latestProgressText(r.latest_progress_date, r.latest_progress, null),
      r.owner_name ?? "",
      MACHINE_ISSUE_STATUS_LABELS[r.status] ?? r.status,
      r.is_key ? "是" : "",
    ]),
  };
}

/** 檔名：交機進度_2026-11-01_2026-11-07.csv；未設日期區間時用今天。 */
export function trackingCsvFilename(
  kind: TrackingKind,
  range: { from: string; to: string },
  today: string,
): string {
  const parts = [range.from, range.to].filter(Boolean);
  const suffix = parts.length > 0 ? parts.join("_") : today;
  return `${TRACKING_TITLES[kind]}_${suffix}.csv`;
}
