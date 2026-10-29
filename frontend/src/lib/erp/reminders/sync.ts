// 提醒事項（#274）：廠商備註 → auto 規則的同步計畫。純函式；套用由 RPC erp_apply_reminder_sync（0040）
// 在單一交易內完成（server action 與 scripts/sync-vendor-reminders.ts 共用）。
//
// 比對方式：每條 auto 規則存有 auto_key（parse-note.ts 的 ruleKey：週期＋標題），與備註原文寫法無關。
//   - 備註解析出、但該廠商沒有同 key 的 auto 規則 → 新增（起算日＝今天，不會冒出過去的逾期）。
//     若已有同週期同事項的 manual 規則（不論啟用與否）→ 視為人工已處理，不另建。
//   - 有同 key 的 auto 規則 → 只更新原文；使用者改過的標題、提前天數、啟用狀態保留。
//     先前因備註刪除而停用（auto_missing）者 → 重新啟用。
//   - 該廠商的 auto 規則在備註中不再出現 → 停用並標記 auto_missing（保留處理紀錄，不刪除）。
//   - manual 規則一律不動；不在這次同步範圍內的廠商不動。
import { parseReminderText, ruleKey } from "./parse-note";
import type { ReminderRuleKind, ReminderRuleSource } from "./schedule";

export interface VendorNoteInput {
  id: string;
  note: string | null;
  payment_terms: string | null;
}

export interface ExistingReminderRule {
  id: string;
  vendor_id: string | null;
  source: ReminderRuleSource;
  auto_key: string | null;
  active: boolean;
  auto_missing: boolean;
  source_text: string | null;
  title: string;
  kind: ReminderRuleKind;
  day_of_month: number | null;
  weekday: number | null;
  month: number | null;
}

/** 同步時讀取既有規則用的欄位（與 ExistingReminderRule 對應）。 */
export const SYNC_RULE_COLUMNS =
  "id, vendor_id, source, auto_key, active, auto_missing, source_text, title, kind, day_of_month, weekday, month";

export interface SyncInsert {
  vendor_id: string;
  auto_key: string;
  title: string;
  kind: "monthly" | "weekly" | "yearly";
  day_of_month: number | null;
  weekday: number | null;
  month: number | null;
  source_text: string;
  start_date: string;
}

export interface SyncUpdate {
  id: string;
  source_text: string | null;
  active: boolean;
  auto_missing: boolean;
}

export interface SyncPlan {
  vendor_ids: string[];
  insert: SyncInsert[];
  update: SyncUpdate[];
}

export function isEmptySyncPlan(p: SyncPlan): boolean {
  return p.insert.length === 0 && p.update.length === 0;
}

function keyOfExisting(r: ExistingReminderRule): string | null {
  if (r.kind === "once") return null;
  return ruleKey({
    kind: r.kind,
    dayOfMonth: r.day_of_month,
    weekday: r.weekday,
    month: r.month,
    title: r.title,
  });
}

export function planVendorReminderSync(
  vendors: VendorNoteInput[],
  existing: ExistingReminderRule[],
  today: string,
): SyncPlan {
  const plan: SyncPlan = { vendor_ids: [], insert: [], update: [] };
  for (const v of vendors) {
    plan.vendor_ids.push(v.id);
    const mine = existing.filter((r) => r.vendor_id === v.id);
    const autoByKey = new Map(
      mine
        .filter((r) => r.source === "auto" && r.auto_key)
        .map((r) => [r.auto_key as string, r]),
    );
    const manualKeys = new Set(
      mine
        .filter((r) => r.source === "manual")
        .map(keyOfExisting)
        .filter((k): k is string => k !== null),
    );
    const parsed = parseReminderText(v.note, v.payment_terms).rules;
    const seen = new Set<string>();

    for (const p of parsed) {
      seen.add(p.key);
      const cur = autoByKey.get(p.key);
      if (!cur) {
        if (manualKeys.has(p.key)) continue;
        plan.insert.push({
          vendor_id: v.id,
          auto_key: p.key,
          title: p.title,
          kind: p.kind,
          day_of_month: p.dayOfMonth,
          weekday: p.weekday,
          month: p.month,
          source_text: p.sourceText,
          start_date: today,
        });
        continue;
      }
      if (cur.auto_missing) {
        plan.update.push({
          id: cur.id,
          source_text: p.sourceText,
          active: true,
          auto_missing: false,
        });
      } else if (cur.source_text !== p.sourceText) {
        plan.update.push({
          id: cur.id,
          source_text: p.sourceText,
          active: cur.active,
          auto_missing: false,
        });
      }
    }

    for (const [key, cur] of autoByKey) {
      if (seen.has(key) || cur.auto_missing) continue;
      plan.update.push({
        id: cur.id,
        source_text: cur.source_text,
        active: false,
        auto_missing: true,
      });
    }
  }
  return plan;
}
