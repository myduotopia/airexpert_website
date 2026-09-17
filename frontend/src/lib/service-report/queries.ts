// 機台維護報告單查詢 — SERVER ONLY。一律以登入者 session（getServerSupabase）讀，靠 RLS
// has_module('service_report') 擋（sr_reports、mx_customers / mx_machines 的 select policy）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { srErrorMessage } from "./errors";
import type { SrCustomerOption, SrMachineOption } from "./prefill";
import type {
  ServiceItem,
  ServiceReport,
  ServiceReportStatus,
  SrResult,
  TimeSlot,
} from "./types";
import { STATUS_LABELS } from "./types";
import { isUuid, isValidIsoDate } from "./validate";

export const REPORT_PAGE_SIZE = 50;

/** 列表列（管理列表所需欄位）。 */
export interface ServiceReportListRow {
  id: string;
  report_no: string;
  report_date: string;
  time_slot: TimeSlot | null;
  status: ServiceReportStatus;
  customer_name: string | null;
  equipment: string | null;
  serial_no: string | null;
  service_items: ServiceItem[];
  print_count: number;
  last_printed_at: string | null;
  created_at: string;
}

export interface ListReportsParams {
  /** 關鍵字：派工單號 / 客戶名稱 / 設備 / 編號。 */
  q?: string | null;
  /** 狀態篩選；空或不合法 = 全部。 */
  status?: string | null;
  /** 維護日期起訖（西元 YYYY-MM-DD，含端點）；不合法忽略。 */
  from?: string | null;
  to?: string | null;
  /** 1 起算。 */
  page?: number;
}

export interface ListReportsData {
  rows: ServiceReportListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const LIST_COLUMNS =
  "id, report_no, report_date, time_slot, status, customer_name, equipment, serial_no, service_items, print_count, last_printed_at, created_at";

/** PostgREST or-filter 的值不可含結構字元；移除以避免注入 / 語法錯誤。 */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()"\\%*]/g, " ").trim();
}

/** PostgREST：range 起點超出結果筆數（HTTP 416）。 */
function isRangeNotSatisfiable(
  error: { code?: string; status?: number } | null | undefined,
): boolean {
  return error?.code === "PGRST103" || error?.status === 416;
}

/**
 * 報告單列表（可篩狀態 / 關鍵字 / 維護日期區間，每頁 50 筆，新→舊）。
 * 頁碼超出最後一頁（例：過期的 ?page= 連結、資料被刪）時 PostgREST 回 416 / PGRST103；
 * 此時重查筆數並改回最後一頁（無資料 → 第 1 頁空列表），不當成錯誤。
 */
export async function listReports(
  params: ListReportsParams = {},
): Promise<SrResult<ListReportsData>> {
  const requested = Math.max(1, Math.floor(Number(params.page) || 1));
  const supabase = await getServerSupabase();
  const q = sanitizeSearch(params.q ?? "");

  const buildQuery = (head: boolean) => {
    let query = supabase
      .from("sr_reports")
      .select(LIST_COLUMNS, { count: "exact", head });
    if (params.status && Object.hasOwn(STATUS_LABELS, params.status)) {
      query = query.eq("status", params.status);
    }
    if (isValidIsoDate(params.from))
      query = query.gte("report_date", params.from);
    if (isValidIsoDate(params.to)) query = query.lte("report_date", params.to);
    if (q) {
      query = query.or(
        ["report_no", "customer_name", "equipment", "serial_no"]
          .map((col) => `${col}.ilike.%${q}%`)
          .join(","),
      );
    }
    return query;
  };

  const fetchPage = (page: number) => {
    const start = (page - 1) * REPORT_PAGE_SIZE;
    return buildQuery(false)
      .order("report_date", { ascending: false })
      .order("report_no", { ascending: false })
      .range(start, start + REPORT_PAGE_SIZE - 1);
  };

  let page = requested;
  let { data, error, count } = await fetchPage(page);
  if (isRangeNotSatisfiable(error)) {
    const counted = await buildQuery(true);
    if (counted.error) {
      return { ok: false, error: srErrorMessage(counted.error) };
    }
    const total = counted.count ?? 0;
    const lastPage = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    if (total === 0 || lastPage >= requested) {
      // 無資料（或筆數在兩次查詢間變動）→ 回空列表，不再重試避免循環。
      return {
        ok: true,
        data: {
          rows: [],
          total,
          page: total === 0 ? 1 : requested,
          pageSize: REPORT_PAGE_SIZE,
        },
      };
    }
    page = lastPage;
    ({ data, error, count } = await fetchPage(page));
  }
  if (error) return { ok: false, error: srErrorMessage(error) };
  return {
    ok: true,
    data: {
      rows: (data ?? []) as ServiceReportListRow[],
      total: count ?? 0,
      page,
      pageSize: REPORT_PAGE_SIZE,
    },
  };
}

/** 單張報告單；不存在（或無權限看到）回 data: null。 */
export async function getReport(
  id: string,
): Promise<SrResult<ServiceReport | null>> {
  if (!isUuid(id)) return { ok: true, data: null };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("sr_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: srErrorMessage(error) };
  return { ok: true, data: (data as ServiceReport | null) ?? null };
}

/** 客戶選單（帶入用），依客戶編號 → 名稱排序。 */
export async function listCustomerOptions(): Promise<
  SrResult<SrCustomerOption[]>
> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_customers")
    .select(
      "id, code, name, invoice_title, phone, tax_id, contact_person, address",
    )
    .order("code", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: srErrorMessage(error) };
  return { ok: true, data: (data ?? []) as SrCustomerOption[] };
}

/** 機台選單（未封存），可限定客戶；依代號 → 機號排序。 */
export async function listMachineOptions(
  customerId?: string | null,
): Promise<SrResult<SrMachineOption[]>> {
  if (customerId && !isUuid(customerId)) return { ok: true, data: [] };
  const supabase = await getServerSupabase();
  let query = supabase
    .from("mx_machines")
    .select(
      "id, customer_id, card_type, machine_no, serial_no, model, horsepower, voltage",
    )
    .is("archived_at", null);
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query
    .order("machine_no", { ascending: true, nullsFirst: false })
    .order("serial_no", { ascending: true, nullsFirst: false });
  if (error) return { ok: false, error: srErrorMessage(error) };
  return { ok: true, data: (data ?? []) as SrMachineOption[] };
}
