// 到期提醒區塊的顯示轉換（spec §6.1）— 純函式（無 DB / 無 React），供元件與測試共用。
// 排序一律由 listReminders（plan/due.sortReminders）決定，這裡不重排。
import { rocDate } from "@/lib/admin/minguo";
import {
  REMINDER_STATUS_LABELS,
  type ReminderStatus,
  type StageReminder,
} from "@/lib/service-report/plan/types";
import { SERVICE_REPORTS_PATH } from "./list-params";

/** 預設直接顯示幾筆，其餘收在 <details> 裡（spec §6.1）。 */
export const REMINDER_VISIBLE_COUNT = 5;

/**
 * 客戶名稱顯示上限（字元）。提醒區塊必須維持一列高，超長名稱會把整塊撐開，
 * 因此截斷顯示、完整名稱放 title。
 */
export const REMINDER_CUSTOMER_MAX = 14;

/** 徽章色調：due＝警示色、upcoming＝一般提示色。 */
export type ReminderTone = "warning" | "info";

/** 一列提醒的顯示資料（元件只負責排版，不再做任何計算）。 */
export interface ReminderRowView {
  key: string;
  /** 截斷後的客戶名稱。 */
  customerName: string;
  /** 完整客戶名稱（title 屬性；未截斷時與 customerName 相同）。 */
  customerTitle: string;
  /** 客戶名稱是否被截斷。 */
  truncated: boolean;
  /** 機台顯示文字（來自 plan/due.machineLabel，已在 StageReminder 內）。 */
  machineLabel: string;
  /** 目前時數，如「22,278 小時」。 */
  hoursText: string;
  /** 民國抄表日，如「民國115/09/11」。 */
  readAtText: string;
  /** 這次要提醒的里程碑，如「22000 小時 基礎保養」。 */
  stageText: string;
  /** 方案名稱（title 補充用）。 */
  planName: string;
  status: ReminderStatus;
  /** 徽章文字：「已達門檻」或「預計 115/10/12 到期」。 */
  statusText: string;
  statusTone: ReminderTone;
  /** 開立報告單連結（帶 machineId / stageId）。 */
  href: string;
}

const TONES: Record<ReminderStatus, ReminderTone> = {
  due: "warning",
  upcoming: "info",
};

/** 千分位（不依賴 locale，server / client / 測試結果一致）。 */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const rounded = Math.round(hours);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${sign}${digits} 小時`;
}

/** 西元 ISO → 民國短式「115/10/12」（徽章用，不帶「民國」二字）。 */
export function rocShortDate(iso: string | null | undefined): string {
  const full = rocDate(iso);
  return full.startsWith("民國") ? full.slice(2) : full;
}

/** rocShortDate 的合法輸出（民國年 / 月 / 日）。 */
const ROC_SHORT = /^\d{1,3}\/\d{2}\/\d{2}$/;

/** 徽章文字：已達門檻／預計 115/10/12 到期；無（或不合法）預估日期時退回通用標籤。 */
export function reminderStatusText(
  status: ReminderStatus,
  dueDate: string | null | undefined,
): string {
  if (status === "due") return REMINDER_STATUS_LABELS.due;
  const short = rocShortDate(dueDate);
  if (!ROC_SHORT.test(short)) return REMINDER_STATUS_LABELS.upcoming;
  return `預計 ${short} 到期`;
}

/**
 * 開立報告單連結：/admin/service-reports/new?machineId=…&stageId=…&milestone=…。
 * milestone 是循環里程碑（如 22000）；開單頁以「階段 + 里程碑」找出要套用的那一列。
 */
export function newReportHref(
  machineId: string,
  stageId: string,
  milestone: number,
): string {
  const params = new URLSearchParams({
    machineId,
    stageId,
    milestone: String(milestone),
  });
  return `${SERVICE_REPORTS_PATH}/new?${params.toString()}`;
}

function truncate(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/** StageReminder → 一列的顯示資料。 */
export function toReminderRow(reminder: StageReminder): ReminderRowView {
  const full = (reminder.customer_name ?? "").trim() || "（未命名客戶）";
  const shown = truncate(full, REMINDER_CUSTOMER_MAX);
  return {
    key: `${reminder.machine_id}:${reminder.stage_id}:${reminder.milestone}`,
    customerName: shown,
    customerTitle: full,
    truncated: shown !== full,
    machineLabel: reminder.machine_label,
    hoursText: formatHours(reminder.latest_hours),
    readAtText: rocDate(reminder.latest_date),
    stageText: reminder.stage_label,
    planName: reminder.plan_name,
    status: reminder.status,
    statusText: reminderStatusText(reminder.status, reminder.due_date),
    statusTone: TONES[reminder.status] ?? "info",
    href: newReportHref(
      reminder.machine_id,
      reminder.stage_id,
      reminder.milestone,
    ),
  };
}

/** 前 N 筆直接顯示、其餘收摺（spec §6.1）。不重新排序。 */
export function splitReminders<T>(
  rows: readonly T[],
  visible: number = REMINDER_VISIBLE_COUNT,
): { head: T[]; rest: T[] } {
  const limit = Math.max(0, visible);
  return { head: rows.slice(0, limit), rest: rows.slice(limit) };
}
