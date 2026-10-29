// 提醒事項（#274）：到期計算、清單組裝、排序、色標與篩選。純函式，client / server 皆可用。
//
// 日期一律為西元 YYYY-MM-DD 字串（台灣日期，today 由呼叫端以 taipeiToday() 取得），以 UTC 午夜運算避免時區偏移。
// 每條規則列出「到期日 ∈ [起點, today + 提前天數]」且尚未處理（完成／略過）的每一次到期：
//   起點 = max(today − LOOKBACK_DAYS, 起算日)；單次規則不看起算日。往回最多看 60 天，避免無限累積。
// 每月 N 日：N 大於當月天數（31 日遇小月、29–31 日遇 2 月）取當月最後一天；-1 ＝ 月底。
// 每年 2/29：平年取 2/28。
// 支票：已過帳、未兌現（pending）的收票／開票，依 check_due_date 以固定提前 7 天、同樣往回 60 天列入（唯讀）。
import { rocDate } from "@/lib/admin/minguo";

export type ReminderRuleKind = "monthly" | "weekly" | "yearly" | "once";
export type ReminderRuleSource = "auto" | "manual";
export type ReminderItemSource = ReminderRuleSource | "check";
export type Urgency = "overdue" | "urgent" | "soon" | "later";

/** 逾期往回最多看幾天。 */
export const LOOKBACK_DAYS = 60;
/** 支票到期的提前天數（同 ERP 總覽「7 日內到期支票」）。 */
export const CHECK_LEAD_DAYS = 7;
/** 規則預設提前天數。 */
export const DEFAULT_LEAD_DAYS = 7;

export interface ReminderRuleRow {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  title: string;
  kind: ReminderRuleKind;
  /** monthly：1–31 或 -1（月底）；yearly：1–31。 */
  day_of_month: number | null;
  /** weekly：0（日）–6（六）。 */
  weekday: number | null;
  month: number | null;
  once_date: string | null;
  start_date: string;
  lead_days: number;
  active: boolean;
  source: ReminderRuleSource;
  source_text: string | null;
  note: string | null;
}

export interface CheckDueInput {
  id: string;
  direction: "in" | "out";
  kind: string | null;
  doc_no: string | null;
  check_no: string | null;
  check_due_date: string | null;
  amount: number;
  bank: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  party_name: string | null;
}

export interface ReminderParty {
  /** 篩選用鍵：vendor:<id>／customer:<id>。 */
  key: string;
  name: string;
  href: string;
}

export interface ReminderItem {
  /** rule:<ruleId>:<dueDate>／check:<paymentId>。 */
  key: string;
  source: ReminderItemSource;
  ruleId: string | null;
  paymentId: string | null;
  dueDate: string;
  daysLeft: number;
  urgency: Urgency;
  title: string;
  party: ReminderParty | null;
  /** 規則：週期文字；支票：單號／票號／銀行／金額。 */
  detail: string;
  note: string | null;
  sourceText: string | null;
  /** 支票：收付款單頁。規則為 null（操作在列上）。 */
  href: string | null;
}

// ── 日期工具 ─────────────────────────────────────────────────

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toMs(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`日期格式錯誤：${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDaysIso(iso: string, days: number): string {
  return fromMs(toMs(iso) + days * DAY_MS);
}
export function diffDays(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function ymd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 某年某月的實際到期日（-1 或超過當月天數 → 月底）。 */
function monthlyDate(year: number, month: number, day: number): string {
  const last = lastDayOfMonth(year, month);
  return ymd(year, month, day === -1 ? last : Math.min(day, last));
}

// ── 到期日 ───────────────────────────────────────────────────

type ScheduleFields = Pick<
  ReminderRuleRow,
  "kind" | "day_of_month" | "weekday" | "month" | "once_date"
>;

/** 規則在 [from, to]（含）之間的所有到期日，由早到晚。 */
export function dueDatesBetween(
  rule: ScheduleFields,
  from: string,
  to: string,
): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const inRange = (d: string) => d >= from && d <= to;

  if (rule.kind === "once") {
    if (rule.once_date && inRange(rule.once_date)) out.push(rule.once_date);
    return out;
  }
  if (rule.kind === "weekly") {
    if (rule.weekday === null) return out;
    const start = toMs(from);
    const offset = (rule.weekday - new Date(start).getUTCDay() + 7) % 7;
    for (let ms = start + offset * DAY_MS; ms <= toMs(to); ms += 7 * DAY_MS) {
      out.push(fromMs(ms));
    }
    return out;
  }
  if (rule.day_of_month === null) return out;
  if (rule.kind === "yearly") {
    if (rule.month === null) return out;
    for (let y = fy; y <= ty; y++) {
      const d = monthlyDate(y, rule.month, rule.day_of_month);
      if (inRange(d)) out.push(d);
    }
    return out;
  }
  // monthly
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); ) {
    const d = monthlyDate(y, m, rule.day_of_month);
    if (inRange(d)) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * 規則目前應顯示的到期（已逾期未處理 + 在提前天數內），由早到晚。
 * handled：此規則已處理（完成／略過）的到期日。停用的規則回空陣列。
 */
export function pendingDueDates(
  rule: ReminderRuleRow,
  today: string,
  handled: ReadonlySet<string>,
  lookbackDays = LOOKBACK_DAYS,
): { dueDate: string; daysLeft: number }[] {
  if (!rule.active) return [];
  const back = addDaysIso(today, -lookbackDays);
  const from =
    rule.kind === "once" || rule.start_date < back ? back : rule.start_date;
  const to = addDaysIso(today, Math.max(0, rule.lead_days));
  return dueDatesBetween(rule, from, to)
    .filter((d) => !handled.has(d))
    .map((d) => ({ dueDate: d, daysLeft: diffDays(today, d) }));
}

// ── 色標與文字 ───────────────────────────────────────────────

/** 逾期＝紅、0 到 3 天＝橘、4 到 7 天＝黃、8 天以上（提前天數設得較長時）＝一般。 */
export function urgencyOf(daysLeft: number): Urgency {
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 3) return "urgent";
  if (daysLeft <= 7) return "soon";
  return "later";
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "已逾期",
  urgent: "3 天內",
  soon: "4–7 天",
  later: "8 天以上",
};

export const SOURCE_LABEL: Record<ReminderItemSource, string> = {
  auto: "備註",
  manual: "手動",
  check: "支票",
};

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `逾期 ${-daysLeft} 天`;
  if (daysLeft === 0) return "今天到期";
  return `剩 ${daysLeft} 天`;
}

export const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** 週期文字：每月 10 日／每月月底／每週三／每年 3 月 15 日／單次 115/11/05。 */
export function recurrenceLabel(rule: ScheduleFields): string {
  switch (rule.kind) {
    case "monthly":
      if (rule.day_of_month === -1) return "每月月底";
      return rule.day_of_month !== null && rule.day_of_month > 28
        ? `每月 ${rule.day_of_month} 日（小月為月底）`
        : `每月 ${rule.day_of_month} 日`;
    case "weekly":
      return `每週${WEEKDAY_LABEL[rule.weekday ?? 0]}`;
    case "yearly":
      return `每年 ${rule.month} 月 ${rule.day_of_month} 日`;
    case "once":
      return `單次 ${rocDate(rule.once_date)}`;
  }
}

// ── 清單 ─────────────────────────────────────────────────────

function vendorParty(id: string, name: string | null): ReminderParty {
  return {
    key: `vendor:${id}`,
    name: name ?? "（未命名廠商）",
    href: `/admin/erp/vendors/${id}`,
  };
}

/** 收票／開票（退款票標示「退款」），同 lib/erp/reports.ts 的 checkFlowLabel。 */
function checkTitle(c: CheckDueInput): string {
  const refund = c.kind === "refund";
  const incoming = (c.direction === "in") !== refund;
  return `${incoming ? "收票" : "開票"}到期${refund ? "（退款）" : ""}`;
}

const MONEY = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

export function compareReminderItems(a: ReminderItem, b: ReminderItem) {
  return (
    a.daysLeft - b.daysLeft ||
    (a.party?.name ?? "").localeCompare(b.party?.name ?? "", "zh-Hant") ||
    a.title.localeCompare(b.title, "zh-Hant") ||
    a.key.localeCompare(b.key)
  );
}

/**
 * 組出提醒清單：規則的每一次到期（扣掉已處理）＋未兌現支票。
 * 排序：剩餘天數由少到多（逾期為負數 → 逾期越久越前），同天再依對象、事項。
 */
export function buildReminderItems(input: {
  today: string;
  rules: ReminderRuleRow[];
  handled: { rule_id: string; due_date: string }[];
  checks: CheckDueInput[];
  lookbackDays?: number;
}): ReminderItem[] {
  const { today, lookbackDays = LOOKBACK_DAYS } = input;
  const handledByRule = new Map<string, Set<string>>();
  for (const h of input.handled) {
    const set = handledByRule.get(h.rule_id) ?? new Set<string>();
    set.add(h.due_date);
    handledByRule.set(h.rule_id, set);
  }
  const items: ReminderItem[] = [];

  for (const r of input.rules) {
    const handled = handledByRule.get(r.id) ?? new Set<string>();
    for (const { dueDate, daysLeft } of pendingDueDates(
      r,
      today,
      handled,
      lookbackDays,
    )) {
      items.push({
        key: `rule:${r.id}:${dueDate}`,
        source: r.source,
        ruleId: r.id,
        paymentId: null,
        dueDate,
        daysLeft,
        urgency: urgencyOf(daysLeft),
        title: r.title,
        party: r.vendor_id ? vendorParty(r.vendor_id, r.vendor_name) : null,
        detail: recurrenceLabel(r),
        note: r.note,
        sourceText: r.source_text,
        href: null,
      });
    }
  }

  const back = addDaysIso(today, -lookbackDays);
  const end = addDaysIso(today, CHECK_LEAD_DAYS);
  for (const c of input.checks) {
    const due = c.check_due_date;
    if (!due || due < back || due > end) continue;
    const daysLeft = diffDays(today, due);
    const party: ReminderParty | null = c.vendor_id
      ? vendorParty(c.vendor_id, c.party_name)
      : c.customer_id
        ? {
            key: `customer:${c.customer_id}`,
            name: c.party_name ?? "（未命名客戶）",
            href: `/admin/erp/customers/${c.customer_id}`,
          }
        : null;
    items.push({
      key: `check:${c.id}`,
      source: "check",
      ruleId: null,
      paymentId: c.id,
      dueDate: due,
      daysLeft,
      urgency: urgencyOf(daysLeft),
      title: checkTitle(c),
      party,
      detail: [
        c.doc_no,
        c.check_no ? `票號 ${c.check_no}` : null,
        c.bank,
        `NT$ ${MONEY.format(Number(c.amount) || 0)}`,
      ]
        .filter(Boolean)
        .join("・"),
      note: null,
      sourceText: null,
      href: `/admin/erp/${c.direction === "in" ? "collections" : "disbursements"}/${c.id}`,
    });
  }

  return items.sort(compareReminderItems);
}

export interface ReminderFilters {
  urgency?: Urgency | "";
  source?: ReminderItemSource | "";
  /** ReminderParty.key */
  party?: string;
  q?: string;
}

export function filterReminderItems(
  items: ReminderItem[],
  f: ReminderFilters,
): ReminderItem[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.urgency || i.urgency === f.urgency) &&
      (!f.source || i.source === f.source) &&
      (!f.party || i.party?.key === f.party) &&
      (!q ||
        [i.title, i.party?.name, i.detail, i.note, i.sourceText]
          .filter(Boolean)
          .some((s) => (s as string).toLowerCase().includes(q))),
  );
}

/** 側欄徽章：已逾期 + 3 天內到期的數量。 */
export function badgeCount(items: ReminderItem[]): number {
  return items.filter((i) => i.daysLeft <= 3).length;
}
