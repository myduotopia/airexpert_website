// ERP 提醒事項（#274）查詢與同步 — SERVER ONLY。
// 讀寫走登入者 session（RLS：has_module('erp')）。到期計算在 lib/erp/reminders/schedule.ts（純函式）。
import "server-only";

import { cache } from "react";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "../errors";
import { ensureErp } from "../guard";
import { parseReminderText } from "../reminders/parse-note";
import {
  CHECK_LEAD_DAYS,
  LOOKBACK_DAYS,
  addDaysIso,
  badgeCount,
  buildReminderItems,
  type CheckDueInput,
  type ReminderItem,
  type ReminderRuleRow,
} from "../reminders/schedule";
import {
  SYNC_RULE_COLUMNS,
  isEmptySyncPlan,
  planVendorReminderSync,
  type ExistingReminderRule,
  type SyncPlan,
  type VendorNoteInput,
} from "../reminders/sync";
import { taipeiToday } from "../statement";
import type { ErpResult } from "../types";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;
type Ref<T> = T | T[] | null;

function first<T>(r: Ref<T> | undefined): T | null {
  return (Array.isArray(r) ? r[0] : r) ?? null;
}

class QueryError extends Error {}

async function fetchAll<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string; details?: string } | null;
  }>,
): Promise<T[]> {
  const { data, error } = await fetchAllRows<
    T,
    { message?: string; details?: string }
  >(run);
  if (error) throw new QueryError(erpErrorMessage(error));
  return data;
}

async function wrap<T>(fn: () => Promise<T>): Promise<ErpResult<T>> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "讀取提醒事項失敗。",
    };
  }
}

// ── 規則 ─────────────────────────────────────────────────────

export interface ReminderRuleFull extends ReminderRuleRow {
  auto_missing: boolean;
  vendor_code: string | null;
  vendor_active: boolean | null;
  updated_at: string;
}

const RULE_COLUMNS =
  "id, vendor_id, title, kind, day_of_month, weekday, month, once_date, start_date, lead_days, active, source, source_text, auto_missing, note, updated_at, vendor:erp_vendors(code, name, active)";

type RuleRaw = Omit<
  ReminderRuleFull,
  "vendor_name" | "vendor_code" | "vendor_active"
> & {
  vendor?: Ref<{ code: string; name: string; active: boolean }>;
};

function toRule({ vendor, ...r }: RuleRaw): ReminderRuleFull {
  const v = first(vendor);
  return {
    ...r,
    vendor_name: v?.name ?? null,
    vendor_code: v?.code ?? null,
    vendor_active: v?.active ?? null,
  };
}

async function loadRules(
  supabase: Supabase,
  opts: { activeOnly?: boolean; vendorId?: string } = {},
): Promise<ReminderRuleFull[]> {
  const rows = await fetchAll<RuleRaw>((a, b) => {
    let q = supabase.from("erp_reminder_rules").select(RULE_COLUMNS);
    if (opts.activeOnly) q = q.eq("active", true);
    if (opts.vendorId) q = q.eq("vendor_id", opts.vendorId);
    return q.order("created_at").order("id").range(a, b);
  });
  return rows.map(toRule);
}

// ── 提醒清單 ─────────────────────────────────────────────────

type CheckRaw = Omit<CheckDueInput, "party_name"> & {
  customer?: Ref<{ name: string }>;
  vendor?: Ref<{ name: string }>;
};

async function loadReminderItems(supabase: Supabase): Promise<{
  today: string;
  items: ReminderItem[];
  rules: ReminderRuleFull[];
}> {
  const today = taipeiToday();
  const from = addDaysIso(today, -LOOKBACK_DAYS);
  const [rules, handled, checks] = await Promise.all([
    loadRules(supabase, { activeOnly: true }),
    fetchAll<{ rule_id: string; due_date: string }>((a, b) =>
      supabase
        .from("erp_reminder_occurrences")
        .select("rule_id, due_date")
        .gte("due_date", from)
        .order("due_date")
        .order("id")
        .range(a, b),
    ),
    // 同 ERP 總覽「7 日內到期支票」：已過帳、支票、未兌現；另往回看逾期
    fetchAll<CheckRaw>((a, b) =>
      supabase
        .from("erp_payments")
        .select(
          "id, direction, kind, doc_no, check_no, check_due_date, amount, bank, customer_id, vendor_id, customer:mx_customers(name), vendor:erp_vendors(name)",
        )
        .eq("method", "check")
        .eq("status", "posted")
        .eq("check_status", "pending")
        .gte("check_due_date", from)
        .lte("check_due_date", addDaysIso(today, CHECK_LEAD_DAYS))
        .order("check_due_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  // 停用廠商的規則不列入提醒（規則本身保留，於「全部規則」可見）
  const live = rules.filter((r) => r.vendor_active !== false);
  const items = buildReminderItems({
    today,
    rules: live,
    handled,
    checks: checks.map(({ customer, vendor, ...c }) => ({
      ...c,
      amount: Number(c.amount),
      party_name: first(customer)?.name ?? first(vendor)?.name ?? null,
    })),
  });
  return { today, items, rules: live };
}

// 同一次 render 內（(protected) layout 的徽章＋提醒事項頁）只查一次。
const loadReminderItemsCached = cache(async () =>
  loadReminderItems(await getServerSupabase()),
);

export async function getReminderList(): Promise<
  ErpResult<{ today: string; items: ReminderItem[]; rules: ReminderRuleFull[] }>
> {
  return wrap(loadReminderItemsCached);
}

/** 側欄徽章：已逾期 + 3 天內到期數。無 erp 權限或讀取失敗回 null（不影響頁面）。 */
export async function getReminderBadgeCount(): Promise<number | null> {
  try {
    if (await ensureErp()) return null;
    const { items } = await loadReminderItemsCached();
    return badgeCount(items);
  } catch {
    return null;
  }
}

// ── 全部規則／廠商規則 ───────────────────────────────────────

export async function listAllReminderRules(): Promise<
  ErpResult<ReminderRuleFull[]>
> {
  return wrap(async () => loadRules(await getServerSupabase()));
}

export async function listVendorReminderRules(
  vendorId: string,
): Promise<ErpResult<ReminderRuleFull[]>> {
  return wrap(async () => loadRules(await getServerSupabase(), { vendorId }));
}

// ── 最近處理紀錄（可復原）─────────────────────────────────────

export interface HandledRow {
  id: string;
  rule_id: string;
  due_date: string;
  status: "done" | "skipped";
  note: string | null;
  handled_at: string;
  title: string;
  vendor_id: string | null;
  vendor_name: string | null;
}

export async function listRecentHandled(
  days = 30,
): Promise<ErpResult<HandledRow[]>> {
  return wrap(async () => {
    const supabase = await getServerSupabase();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = await fetchAll<
      Omit<HandledRow, "title" | "vendor_id" | "vendor_name"> & {
        rule?: Ref<{
          title: string;
          vendor_id: string | null;
          vendor?: Ref<{ name: string }>;
        }>;
      }
    >((a, b) =>
      supabase
        .from("erp_reminder_occurrences")
        .select(
          "id, rule_id, due_date, status, note, handled_at, rule:erp_reminder_rules(title, vendor_id, vendor:erp_vendors(name))",
        )
        .gte("handled_at", since)
        .order("handled_at", { ascending: false })
        .order("id")
        .range(a, b),
    );
    return rows.map(({ rule, ...r }) => {
      const ru = first(rule);
      return {
        ...r,
        title: ru?.title ?? "—",
        vendor_id: ru?.vendor_id ?? null,
        vendor_name: first(ru?.vendor)?.name ?? null,
      };
    });
  });
}

// ── 待確認 ───────────────────────────────────────────────────

export interface PendingNote {
  vendor: { id: string; code: string; name: string; active: boolean };
  fragments: string[];
}

/** 廠商備註／付款條件中「疑似日期但無法解析」的片段（每次即時解析，不存 DB）。 */
export async function listPendingNotes(): Promise<ErpResult<PendingNote[]>> {
  return wrap(async () => {
    const supabase = await getServerSupabase();
    const vendors = await fetchAll<{
      id: string;
      code: string;
      name: string;
      active: boolean;
      note: string | null;
      payment_terms: string | null;
    }>((a, b) =>
      supabase
        .from("erp_vendors")
        .select("id, code, name, active, note, payment_terms")
        .or("note.not.is.null,payment_terms.not.is.null")
        .order("code")
        .order("id")
        .range(a, b),
    );
    const out: PendingNote[] = [];
    for (const v of vendors) {
      const { unparsed } = parseReminderText(v.note, v.payment_terms);
      if (unparsed.length > 0) {
        out.push({
          vendor: { id: v.id, code: v.code, name: v.name, active: v.active },
          fragments: unparsed,
        });
      }
    }
    return out;
  });
}

// ── 同步（廠商存檔後／批次）──────────────────────────────────

export interface ReminderSyncSummary {
  vendors: number;
  inserted: number;
  updated: number;
}

/**
 * 重新解析指定廠商（或全部廠商）的備註並同步 auto 規則：讀廠商與既有規則 → 純函式算計畫 →
 * RPC erp_apply_reminder_sync 在單一交易內套用（只動 auto、不動 manual）。呼叫端須先 ensureErp()。
 */
async function planSync(
  supabase: Supabase,
  vendorIds: string[] | "all",
): Promise<{ vendors: number; plan: SyncPlan }> {
  const [vendors, existing] = await Promise.all([
    fetchAll<VendorNoteInput>((a, b) => {
      let q = supabase.from("erp_vendors").select("id, note, payment_terms");
      if (vendorIds !== "all") q = q.in("id", vendorIds);
      return q.order("id").range(a, b);
    }),
    fetchAll<ExistingReminderRule>((a, b) => {
      let q = supabase
        .from("erp_reminder_rules")
        .select(SYNC_RULE_COLUMNS)
        .not("vendor_id", "is", null);
      if (vendorIds !== "all") q = q.in("vendor_id", vendorIds);
      return q.order("id").range(a, b);
    }),
  ]);
  return {
    vendors: vendors.length,
    plan: planVendorReminderSync(vendors, existing, taipeiToday()),
  };
}

export async function syncVendorReminders(
  supabase: Supabase,
  vendorIds: string[] | "all",
): Promise<ReminderSyncSummary> {
  if (vendorIds !== "all" && vendorIds.length === 0) {
    return { vendors: 0, inserted: 0, updated: 0 };
  }
  const { vendors, plan } = await planSync(supabase, vendorIds);
  if (isEmptySyncPlan(plan)) {
    return { vendors, inserted: 0, updated: 0 };
  }
  const { data, error } = await supabase.rpc("erp_apply_reminder_sync", {
    p_plan: { insert: plan.insert, update: plan.update },
  });
  if (error) throw new QueryError(erpErrorMessage(error));
  const res = (data ?? {}) as { inserted?: number; updated?: number };
  return {
    vendors,
    inserted: Number(res.inserted) || 0,
    updated: Number(res.updated) || 0,
  };
}

/**
 * 廠商的 auto 規則是否與目前備註不一致（同步有待套用）。廠商存檔時的同步失敗不擋存檔，
 * 廠商詳情頁以此顯示提示與「重新同步」鈕；#273 匯入（直接寫 DB）後尚未批次同步的廠商也會顯示。
 */
export async function getVendorReminderSyncPending(
  vendorId: string,
): Promise<ErpResult<boolean>> {
  return wrap(async () => {
    const { plan } = await planSync(await getServerSupabase(), [vendorId]);
    return !isEmptySyncPlan(plan);
  });
}
