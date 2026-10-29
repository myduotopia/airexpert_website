// 週報追蹤資料（#272）查詢 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；錯誤 throw（同 lib/erp/queries/* 慣例）。
// 清單讀 0038 的 view（security_invoker），篩選與排序依 filters.ts 的 trackingQuerySpec。
import "server-only";

import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getServerSupabase } from "@/lib/supabase-server";
import {
  trackingQuerySpec,
  type QueryFilter,
  type TrackingFilters,
  type TrackingQuerySpec,
} from "./filters";
import type {
  DeliveryDocumentOption,
  DeliveryJobRow,
  MachineIssueRow,
  MachineOption,
  ProgressEntry,
  ProgressParent,
  RepairJobRow,
  TrackingKind,
} from "./types";

/** 清單每頁筆數（同 ERP 基本資料）。 */
export const TRACKING_PAGE_SIZE = 50;

export interface TrackingRowMap {
  delivery: DeliveryJobRow;
  repairs: RepairJobRow;
  "machine-issues": MachineIssueRow;
}

/** 清單 view 的查詢 builder（supabase.from(view).select(...)）。 */
type ViewQuery = ReturnType<
  ReturnType<Awaited<ReturnType<typeof getServerSupabase>>["from"]>["select"]
>;

/** 把查詢規格套到 PostgREST 查詢上。 */
function applySpec(query: ViewQuery, spec: TrackingQuerySpec): ViewQuery {
  let q = query;
  for (const f of spec.filters) q = applyFilter(q, f);
  for (const o of spec.order) {
    q = q.order(o.column, {
      ascending: o.ascending,
      ...(o.nullsFirst === undefined ? {} : { nullsFirst: o.nullsFirst }),
    });
  }
  return q;
}

function applyFilter(q: ViewQuery, f: QueryFilter): ViewQuery {
  switch (f.op) {
    case "eq":
      return q.eq(f.column, f.value);
    case "not_in":
      return q.not(f.column, "in", `(${f.values.join(",")})`);
    case "is_null":
      return q.is(f.column, null);
    case "gte":
      return q.gte(f.column, f.value);
    case "lte":
      return q.lte(f.column, f.value);
    case "ilike":
      return q.ilike(f.column, f.value);
    case "or":
      return q.or(f.value);
  }
}

export async function listTracking<K extends TrackingKind>(
  kind: K,
  filters: TrackingFilters,
): Promise<{
  rows: TrackingRowMap[K][];
  total: number;
  page: number;
  pageSize: number;
}> {
  const spec = trackingQuerySpec(kind, filters);
  const start = (filters.page - 1) * TRACKING_PAGE_SIZE;
  const supabase = await getServerSupabase();
  const { data, error, count } = await applySpec(
    supabase.from(spec.view).select("*", { count: "exact" }),
    spec,
  ).range(start, start + TRACKING_PAGE_SIZE - 1);
  if (error) throw new Error(`讀取追蹤資料失敗：${error.message}`);
  return {
    rows: (data ?? []) as TrackingRowMap[K][],
    total: count ?? 0,
    page: filters.page,
    pageSize: TRACKING_PAGE_SIZE,
  };
}

/** 列印、匯出用：符合篩選的全部列（不分頁；fetchAllRows 讀完）。 */
export async function listAllTracking<K extends TrackingKind>(
  kind: K,
  filters: TrackingFilters,
): Promise<TrackingRowMap[K][]> {
  const spec = trackingQuerySpec(kind, filters);
  const supabase = await getServerSupabase();
  const { data, error } = await fetchAllRows<TrackingRowMap[K]>((from, to) =>
    applySpec(supabase.from(spec.view).select("*"), spec).range(from, to),
  );
  if (error) throw new Error(`讀取追蹤資料失敗：${error.message}`);
  return data;
}

export const PROGRESS_PARENT_COLUMN: Record<ProgressParent, string> = {
  repair: "repair_job_id",
  issue: "machine_issue_id",
};

/** 處理進度時間軸（新到舊）。 */
export async function listProgress(
  parent: ProgressParent,
  parentId: string,
): Promise<ProgressEntry[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("tracking_progress")
    .select("id, progress_date, content, created_at")
    .eq(PROGRESS_PARENT_COLUMN[parent], parentId)
    .order("progress_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(`讀取處理進度失敗：${error.message}`);
  return (data ?? []) as ProgressEntry[];
}

/** 客戶可連結的報價單／銷貨單（新到舊）與整機品項名稱、客戶預收。 */
export async function listDeliveryDocuments(customerId: string): Promise<{
  documents: DeliveryDocumentOption[];
  customerPrepaid: number;
}> {
  const supabase = await getServerSupabase();
  const docsRes = await supabase
    .from("delivery_document_options")
    .select(
      "id, customer_id, doc_type, doc_no, doc_date, status, total_twd, sales_rep_id, sales_rep, linked_allocated",
    )
    .eq("customer_id", customerId)
    .order("doc_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (docsRes.error) {
    throw new Error(`讀取單據失敗：${docsRes.error.message}`);
  }
  const docs = (docsRes.data ?? []) as Omit<
    DeliveryDocumentOption,
    "machine_items"
  >[];

  const machineItems = new Map<string, string[]>();
  if (docs.length > 0) {
    const linesRes = await supabase
      .from("erp_document_lines")
      .select("document_id, line_no, description, erp_items!inner(name, kind)")
      .in(
        "document_id",
        docs.map((d) => d.id),
      )
      .eq("line_type", "item")
      .eq("erp_items.kind", "machine")
      .order("line_no");
    if (linesRes.error) {
      throw new Error(`讀取單據明細失敗：${linesRes.error.message}`);
    }
    for (const l of (linesRes.data ?? []) as unknown as {
      document_id: string;
      description: string | null;
      erp_items: { name: string } | { name: string }[] | null;
    }[]) {
      const item = Array.isArray(l.erp_items) ? l.erp_items[0] : l.erp_items;
      const name = l.description?.trim() || item?.name;
      if (!name) continue;
      const list = machineItems.get(l.document_id) ?? [];
      list.push(name);
      machineItems.set(l.document_id, list);
    }
  }

  const prepaidRes = await supabase
    .from("erp_party_balances")
    .select("unallocated")
    .eq("party_type", "customer")
    .eq("party_id", customerId)
    .maybeSingle();
  if (prepaidRes.error) {
    throw new Error(`讀取客戶預收失敗：${prepaidRes.error.message}`);
  }

  return {
    documents: docs.map((d) => ({
      ...d,
      total_twd: Number(d.total_twd) || 0,
      linked_allocated: Number(d.linked_allocated) || 0,
      machine_items: machineItems.get(d.id) ?? [],
    })),
    customerPrepaid:
      Number(
        (prepaidRes.data as { unallocated: number } | null)?.unallocated,
      ) || 0,
  };
}

/** 客戶的機台（未封存；新機問題選機台用）。 */
export async function listCustomerMachines(
  customerId: string,
): Promise<MachineOption[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("id, serial_no, model, purchased_at")
    .eq("customer_id", customerId)
    .is("archived_at", null)
    .order("purchased_at", { ascending: false, nullsFirst: false })
    .order("serial_no")
    .limit(500);
  if (error) throw new Error(`讀取機台失敗：${error.message}`);
  return (data ?? []) as MachineOption[];
}
