// ERP 報表與總覽查詢 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；回傳 ErpResult，不 throw。
// 彙總在 TS（lib/erp/reports.ts 純函式）完成；帳務表一律 .range 分頁讀完（PostgREST 單次上限 1000 列）。
// 資料量大時可改為 DB view 彙總（本期不新增 migration）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "../errors";
import { ensureErp } from "../guard";
import {
  aggregateSalesMargin,
  buildAgingReport,
  buildSalesFacts,
  countLowStock,
  currentMonthRange,
  addDays,
  filterChecksDue,
  type AgingDocInput,
  type AgingPartyInput,
  type AgingReport,
  type CheckDueInput,
  type LowStockItemInput,
  type SalesDocInput,
  type SalesGroupBy,
  type SalesLineInput,
  type SalesMarginReport,
} from "../reports";
import { taipeiToday } from "../statement";
import type { ErpResult, PartyType } from "../types";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

const CHUNK = 1000;
/** .in() 一次帶入的 id 數（避免 URL 過長）。 */
const ID_CHUNK = 150;

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
  const rows: T[] = [];
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await run(start, start + CHUNK - 1);
    if (error) throw new QueryError(erpErrorMessage(error));
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < CHUNK) return rows;
  }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function wrap<T>(fn: () => Promise<T>): Promise<ErpResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "讀取報表資料失敗。",
    };
  }
}

// ── 名稱對照 ─────────────────────────────────────────────────

export interface PartyLabel {
  code: string | null;
  name: string;
}

async function fetchLabels(
  supabase: Supabase,
  table: "mx_customers" | "erp_vendors" | "erp_items",
  ids: string[],
): Promise<Map<string, PartyLabel & { unit?: string }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, PartyLabel & { unit?: string }>();
  const cols =
    table === "erp_items" ? "id, code, name, unit" : "id, code, name";
  for (const part of chunks(unique, ID_CHUNK)) {
    const rows = await fetchAll<{
      id: string;
      code: string | null;
      name: string;
      unit?: string;
    }>((a, b) =>
      supabase.from(table).select(cols).in("id", part).order("id").range(a, b),
    );
    for (const r of rows)
      map.set(r.id, { code: r.code, name: r.name, unit: r.unit });
  }
  return map;
}

// ── 銷售毛利 ─────────────────────────────────────────────────

export interface SalesMarginRowView {
  key: string | null;
  code: string | null;
  label: string;
  unit: string | null;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  marginRate: number | null;
}

export interface SalesMarginData {
  rows: SalesMarginRowView[];
  totals: SalesMarginReport["totals"];
  documentCount: number;
}

async function loadSalesMargin(
  supabase: Supabase,
  from: string,
  to: string,
  groupBy: SalesGroupBy,
): Promise<SalesMarginData> {
  const docs = await fetchAll<SalesDocInput>((a, b) =>
    supabase
      .from("erp_documents")
      .select(
        "id, doc_type, status, doc_date, customer_id, sales_rep, tax_type, tax_rate, currency, exchange_rate",
      )
      .eq("status", "posted")
      .in("doc_type", ["S", "SR"])
      .gte("doc_date", from)
      .lte("doc_date", to)
      .order("doc_date")
      .order("id")
      .range(a, b),
  );

  const lines: SalesLineInput[] = [];
  for (const part of chunks(
    docs.map((d) => d.id),
    ID_CHUNK,
  )) {
    const rows = await fetchAll<SalesLineInput & { id: string }>((a, b) =>
      supabase
        .from("erp_document_lines")
        .select("id, document_id, line_type, item_id, qty, amount, unit_cost")
        .in("document_id", part)
        .in("line_type", ["item", "discount"])
        .order("id")
        .range(a, b),
    );
    lines.push(...rows);
  }

  const facts = buildSalesFacts(
    docs.map((d) => ({
      ...d,
      tax_rate: Number(d.tax_rate),
      exchange_rate: Number(d.exchange_rate),
    })),
    lines.map((l) => ({
      ...l,
      qty: Number(l.qty),
      amount: Number(l.amount),
      unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
    })),
    { from, to },
  );
  const report = aggregateSalesMargin(facts, groupBy);

  const keys = report.rows.map((r) => r.key).filter((k): k is string => !!k);
  const labels =
    groupBy === "customer"
      ? await fetchLabels(supabase, "mx_customers", keys)
      : groupBy === "item"
        ? await fetchLabels(supabase, "erp_items", keys)
        : null;

  const rows = report.rows.map((r) => {
    let code: string | null = null;
    let label: string;
    let unit: string | null = null;
    if (groupBy === "sales_rep") {
      label = r.key ?? "（未指定業務）";
    } else if (r.key === null) {
      label = groupBy === "item" ? "（未分攤折扣）" : "（未指定客戶）";
    } else {
      const l = labels?.get(r.key);
      code = l?.code ?? null;
      label = l?.name ?? "（已刪除）";
      unit = l?.unit ?? null;
    }
    return { ...r, code, label, unit };
  });
  return { rows, totals: report.totals, documentCount: docs.length };
}

export async function getSalesMarginReport(params: {
  from: string;
  to: string;
  groupBy: SalesGroupBy;
}): Promise<ErpResult<SalesMarginData>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (params.from > params.to)
    return { ok: false, error: "起日不可晚於迄日。" };
  const supabase = await getServerSupabase();
  return wrap(() =>
    loadSalesMargin(supabase, params.from, params.to, params.groupBy),
  );
}

// ── 帳齡（應收 / 應付） ──────────────────────────────────────

export interface AgingRowView extends Omit<AgingReport["rows"][number], never> {
  code: string | null;
  name: string;
}

export interface AgingData {
  rows: AgingRowView[];
  totals: AgingReport["totals"];
}

async function loadAging(
  supabase: Supabase,
  partyType: PartyType,
  asOf: string,
): Promise<AgingData> {
  const docTypes = partyType === "customer" ? ["S", "SR"] : ["I", "PR"];
  const [docs, parties] = await Promise.all([
    fetchAll<AgingDocInput & { document_id: string }>((a, b) =>
      supabase
        .from("erp_document_balances")
        .select(
          "document_id, doc_type, doc_date, customer_id, vendor_id, outstanding",
        )
        .in("doc_type", docTypes)
        .neq("outstanding", 0)
        .order("document_id")
        .range(a, b),
    ),
    fetchAll<AgingPartyInput>((a, b) =>
      supabase
        .from("erp_party_balances")
        .select("party_id, balance, unallocated")
        .eq("party_type", partyType)
        .order("party_id")
        .range(a, b),
    ),
  ]);
  const report = buildAgingReport(
    docs.map((d) => ({ ...d, outstanding: Number(d.outstanding) })),
    parties.map((p) => ({
      ...p,
      balance: Number(p.balance),
      unallocated: Number(p.unallocated),
    })),
    asOf,
    partyType,
  );
  const labels = await fetchLabels(
    supabase,
    partyType === "customer" ? "mx_customers" : "erp_vendors",
    report.rows.map((r) => r.party_id),
  );
  return {
    rows: report.rows.map((r) => ({
      ...r,
      code: labels.get(r.party_id)?.code ?? null,
      name: labels.get(r.party_id)?.name ?? "（已刪除）",
    })),
    totals: report.totals,
  };
}

export async function getAgingReport(params: {
  partyType: PartyType;
  asOf: string;
}): Promise<ErpResult<AgingData>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  return wrap(() => loadAging(supabase, params.partyType, params.asOf));
}

// ── 總覽 ─────────────────────────────────────────────────────

export interface CheckDueRow extends CheckDueInput {
  doc_no: string | null;
  amount: number;
  check_no: string | null;
  bank: string | null;
  party_name: string | null;
}

export interface OverviewData {
  today: string;
  month: { from: string; to: string };
  monthRevenue: number;
  monthMargin: number;
  monthMarginRate: number | null;
  arTotal: number;
  advanceReceived: number;
  apTotal: number;
  advancePaid: number;
  lowStockCount: number;
  checksDue: CheckDueRow[];
}

type PartyRef = { name: string } | { name: string }[] | null;

export async function getOverviewData(): Promise<ErpResult<OverviewData>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const today = taipeiToday();
  const month = currentMonthRange(today);

  return wrap(async () => {
    const [sales, parties, items, levels, checks] = await Promise.all([
      loadSalesMargin(supabase, month.from, month.to, "customer"),
      fetchAll<{
        party_type: PartyType;
        party_id: string;
        balance: number;
        unallocated: number;
      }>((a, b) =>
        supabase
          .from("erp_party_balances")
          .select("party_type, party_id, balance, unallocated")
          .order("party_type")
          .order("party_id")
          .range(a, b),
      ),
      fetchAll<LowStockItemInput>((a, b) =>
        supabase
          .from("erp_items")
          .select("id, track_stock, safety_stock")
          .eq("track_stock", true)
          .order("id")
          .range(a, b),
      ),
      fetchAll<{ item_id: string; qty: number }>((a, b) =>
        supabase
          .from("erp_stock_levels")
          .select("item_id, warehouse_id, qty")
          .order("item_id")
          .order("warehouse_id")
          .range(a, b),
      ),
      fetchAll<
        Omit<CheckDueRow, "party_name"> & {
          customer?: PartyRef;
          vendor?: PartyRef;
        }
      >((a, b) =>
        supabase
          .from("erp_payments")
          .select(
            "id, direction, doc_no, method, status, check_status, check_due_date, check_no, bank, amount, customer:mx_customers(name), vendor:erp_vendors(name)",
          )
          .eq("method", "check")
          .eq("status", "posted")
          .eq("check_status", "pending")
          .gte("check_due_date", today)
          .lte("check_due_date", addDays(today, 7))
          .order("check_due_date")
          .order("id")
          .range(a, b),
      ),
    ]);

    let arTotal = 0;
    let advanceReceived = 0;
    let apTotal = 0;
    let advancePaid = 0;
    for (const p of parties) {
      if (p.party_type === "customer") {
        arTotal += Number(p.balance) || 0;
        advanceReceived += Number(p.unallocated) || 0;
      } else {
        apTotal += Number(p.balance) || 0;
        advancePaid += Number(p.unallocated) || 0;
      }
    }

    const checksDue = filterChecksDue(
      checks.map(({ customer, vendor, ...c }) => {
        const ref = customer ?? vendor ?? null;
        const party = Array.isArray(ref) ? ref[0] : ref;
        return {
          ...c,
          amount: Number(c.amount),
          party_name: party?.name ?? null,
        };
      }),
      today,
      7,
    );

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      today,
      month,
      monthRevenue: sales.totals.revenue,
      monthMargin: sales.totals.margin,
      monthMarginRate: sales.totals.marginRate,
      arTotal: round2(arTotal),
      advanceReceived: round2(advanceReceived),
      apTotal: round2(apTotal),
      advancePaid: round2(advancePaid),
      lowStockCount: countLowStock(
        items.map((i) => ({ ...i, safety_stock: Number(i.safety_stock) })),
        levels.map((l) => ({ ...l, qty: Number(l.qty) })),
      ),
      checksDue,
    };
  });
}
