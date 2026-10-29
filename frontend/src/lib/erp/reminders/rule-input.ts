// 提醒規則表單輸入 → DB 列（#274）。純函式：驗證並只保留該週期需要的欄位（其餘設為 null，符合 0040 的約束）。
import { isIsoDate } from "@/lib/erp/statement";
import { DEFAULT_LEAD_DAYS, type ReminderRuleKind } from "./schedule";

export const RULE_KINDS: { value: ReminderRuleKind; label: string }[] = [
  { value: "monthly", label: "每月" },
  { value: "weekly", label: "每週" },
  { value: "yearly", label: "每年" },
  { value: "once", label: "單次" },
];

export interface ReminderRuleInput {
  vendor_id: string | null;
  title: string;
  kind: ReminderRuleKind;
  /** 每月：1–31 或 -1（月底）；每年：1–31。 */
  day_of_month: number | null;
  weekday: number | null;
  month: number | null;
  once_date: string;
  start_date: string;
  lead_days: number | string;
  active: boolean;
  note: string;
}

export interface ReminderRuleRowInput {
  vendor_id: string | null;
  title: string;
  kind: ReminderRuleKind;
  day_of_month: number | null;
  weekday: number | null;
  month: number | null;
  once_date: string | null;
  start_date: string;
  lead_days: number;
  active: boolean;
  note: string | null;
}

export type RuleInputField = keyof ReminderRuleInput;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function int(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v);
  return null;
}

export function emptyRuleInput(
  today: string,
  vendorId: string | null = null,
): ReminderRuleInput {
  return {
    vendor_id: vendorId,
    title: "",
    kind: "monthly",
    day_of_month: 10,
    weekday: 1,
    month: 1,
    once_date: "",
    start_date: today,
    lead_days: DEFAULT_LEAD_DAYS,
    active: true,
    note: "",
  };
}

export function normalizeRuleInput(
  input: ReminderRuleInput,
):
  | { ok: true; row: ReminderRuleRowInput }
  | { ok: false; error: string; field?: RuleInputField } {
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "請填寫事項。", field: "title" };
  if (title.length > 100) {
    return { ok: false, error: "事項最多 100 字。", field: "title" };
  }
  const lead = int(input.lead_days);
  if (lead === null || lead < 0 || lead > 90) {
    return {
      ok: false,
      error: "提前天數須為 0 到 90 的整數。",
      field: "lead_days",
    };
  }
  if (!isIsoDate(input.start_date)) {
    return { ok: false, error: "請填寫起算日。", field: "start_date" };
  }
  const base = {
    vendor_id: input.vendor_id || null,
    title,
    kind: input.kind,
    day_of_month: null as number | null,
    weekday: null as number | null,
    month: null as number | null,
    once_date: null as string | null,
    start_date: input.start_date,
    lead_days: lead,
    active: !!input.active,
    note: (input.note ?? "").trim() || null,
  };
  const day = int(input.day_of_month);
  switch (input.kind) {
    case "monthly":
      if (day === null || !(day === -1 || (day >= 1 && day <= 31))) {
        return {
          ok: false,
          error: "請選擇每月的日期。",
          field: "day_of_month",
        };
      }
      return { ok: true, row: { ...base, day_of_month: day } };
    case "weekly": {
      const wd = int(input.weekday);
      if (wd === null || wd < 0 || wd > 6) {
        return { ok: false, error: "請選擇星期。", field: "weekday" };
      }
      return { ok: true, row: { ...base, weekday: wd } };
    }
    case "yearly": {
      const m = int(input.month);
      if (m === null || m < 1 || m > 12) {
        return { ok: false, error: "請選擇月份。", field: "month" };
      }
      if (day === null || day < 1 || day > DAYS_IN_MONTH[m - 1]) {
        return {
          ok: false,
          error: `${m} 月沒有這一天。`,
          field: "day_of_month",
        };
      }
      return { ok: true, row: { ...base, month: m, day_of_month: day } };
    }
    case "once":
      if (!isIsoDate(input.once_date)) {
        return { ok: false, error: "請填寫日期。", field: "once_date" };
      }
      return { ok: true, row: { ...base, once_date: input.once_date } };
    default:
      return { ok: false, error: "週期不正確。", field: "kind" };
  }
}

/** 處理（完成／略過）的輸入驗證。 */
export function normalizeHandleInput(input: {
  ruleId: string;
  dueDate: string;
  status: string;
  note?: string | null;
}):
  | {
      ok: true;
      row: {
        rule_id: string;
        due_date: string;
        status: "done" | "skipped";
        note: string | null;
      };
    }
  | { ok: false; error: string } {
  if (!input.ruleId) return { ok: false, error: "缺少規則。" };
  if (!isIsoDate(input.dueDate)) return { ok: false, error: "到期日不正確。" };
  if (input.status !== "done" && input.status !== "skipped") {
    return { ok: false, error: "處理狀態不正確。" };
  }
  const note = (input.note ?? "").trim();
  if (note.length > 500) return { ok: false, error: "備註最多 500 字。" };
  return {
    ok: true,
    row: {
      rule_id: input.ruleId,
      due_date: input.dueDate,
      status: input.status,
      note: note || null,
    },
  };
}

/** 既有規則 → 表單輸入（編輯用）。未使用的週期欄位帶入預設值，切換週期時不會是空白。 */
export function ruleToInput(
  r: {
    vendor_id: string | null;
    title: string;
    kind: ReminderRuleKind;
    day_of_month: number | null;
    weekday: number | null;
    month: number | null;
    once_date: string | null;
    start_date: string;
    lead_days: number;
    active: boolean;
    note: string | null;
  },
  today: string,
): ReminderRuleInput {
  const d = emptyRuleInput(today, r.vendor_id);
  return {
    vendor_id: r.vendor_id,
    title: r.title,
    kind: r.kind,
    day_of_month: r.day_of_month ?? d.day_of_month,
    weekday: r.weekday ?? d.weekday,
    month: r.month ?? d.month,
    once_date: r.once_date ?? "",
    start_date: r.start_date,
    lead_days: r.lead_days,
    active: r.active,
    note: r.note ?? "",
  };
}
