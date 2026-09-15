// 應收應付查詢（收付款列表 / 詳情 / 未沖銷單據 / 對帳單資料）— SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；回傳 ErpResult，不 throw。
// 寫入一律經 lib/erp/rpc.ts（erp_payments 用戶端只可改 check_status / note）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "../errors";
import { ensureErp } from "../guard";
import {
  buildStatement,
  roundCents,
  type Statement,
  type StatementDocInput,
  type StatementParty,
  type StatementPaymentInput,
} from "../statement";
import type {
  CheckStatus,
  DocType,
  ErpDocumentBalance,
  ErpPayment,
  ErpResult,
  PaymentDirection,
  PaymentMethod,
} from "../types";

export const PAYMENT_PAGE_SIZE = 50;

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

/** 收款 → S / SR；付款 → I / PR。 */
export function docTypesForDirection(direction: PaymentDirection): DocType[] {
  return direction === "in" ? ["S", "SR"] : ["I", "PR"];
}

/** PostgREST or-filter 的值不可含結構字元；移除以避免注入 / 語法錯誤。 */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()"\\%*:]/g, " ").trim();
}

interface PartyRef {
  code: string | null;
  name: string;
}

function partyOf(raw: {
  customer?: PartyRef | PartyRef[] | null;
  vendor?: PartyRef | PartyRef[] | null;
}): PartyRef | null {
  const p = raw.customer ?? raw.vendor ?? null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

// ── 收付款列表 ───────────────────────────────────────────────

export interface PaymentListRow extends Pick<
  ErpPayment,
  | "id"
  | "direction"
  | "doc_no"
  | "pay_date"
  | "customer_id"
  | "vendor_id"
  | "method"
  | "amount"
  | "check_no"
  | "check_due_date"
  | "bank"
  | "check_status"
  | "status"
  | "void_reason"
> {
  party_code: string | null;
  party_name: string | null;
  allocated: number;
  /** 未沖銷餘額（預收 / 預付）；作廢為 0。 */
  unallocated: number;
}

export interface ListPaymentsParams {
  direction: PaymentDirection;
  /** 搜尋單號 / 票號 / 客戶廠商編號名稱。 */
  q?: string | null;
  from?: string | null;
  to?: string | null;
  method?: PaymentMethod | null;
  checkStatus?: CheckStatus | null;
  page?: number;
}

const PAYMENT_LIST_COLUMNS =
  "id, direction, doc_no, pay_date, customer_id, vendor_id, method, amount, check_no, check_due_date, bank, check_status, status, void_reason, created_at, customer:mx_customers(code, name), vendor:erp_vendors(code, name), erp_payment_allocations(amount)";

type RawPayment = PaymentListRow & {
  customer?: PartyRef | PartyRef[] | null;
  vendor?: PartyRef | PartyRef[] | null;
  erp_payment_allocations?: { amount: number }[] | null;
};

function toListRow(raw: RawPayment): PaymentListRow {
  const allocated = roundCents(
    (raw.erp_payment_allocations ?? []).reduce(
      (s, a) => s + (Number(a.amount) || 0),
      0,
    ),
  );
  const party = partyOf(raw);
  return {
    id: raw.id,
    direction: raw.direction,
    doc_no: raw.doc_no,
    pay_date: raw.pay_date,
    customer_id: raw.customer_id,
    vendor_id: raw.vendor_id,
    method: raw.method,
    amount: Number(raw.amount),
    check_no: raw.check_no,
    check_due_date: raw.check_due_date,
    bank: raw.bank,
    check_status: raw.check_status,
    status: raw.status,
    void_reason: raw.void_reason,
    party_code: party?.code ?? null,
    party_name: party?.name ?? null,
    allocated,
    unallocated:
      raw.status === "posted" ? roundCents(Number(raw.amount) - allocated) : 0,
  };
}

/** 依關鍵字找出符合的客戶 / 廠商 id（供收付款列表搜尋對象名稱）。 */
async function matchPartyIds(
  supabase: Supabase,
  direction: PaymentDirection,
  q: string,
): Promise<string[]> {
  const table = direction === "in" ? "mx_customers" : "erp_vendors";
  const { data } = await supabase
    .from(table)
    .select("id")
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .limit(200);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** 收付款列表（新→舊，每頁 50 筆）。 */
export async function listPayments(params: ListPaymentsParams): Promise<
  ErpResult<{
    rows: PaymentListRow[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const denied = await ensureErp();
  if (denied) return denied;
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const supabase = await getServerSupabase();

  let query = supabase
    .from("erp_payments")
    .select(PAYMENT_LIST_COLUMNS, { count: "exact" })
    .eq("direction", params.direction);
  if (params.from) query = query.gte("pay_date", params.from);
  if (params.to) query = query.lte("pay_date", params.to);
  if (params.method) query = query.eq("method", params.method);
  if (params.checkStatus) query = query.eq("check_status", params.checkStatus);

  const q = sanitizeSearch(params.q ?? "");
  if (q) {
    const partyCol = params.direction === "in" ? "customer_id" : "vendor_id";
    const ids = await matchPartyIds(supabase, params.direction, q);
    const clauses = [`doc_no.ilike.%${q}%`, `check_no.ilike.%${q}%`];
    if (ids.length > 0) clauses.push(`${partyCol}.in.(${ids.join(",")})`);
    query = query.or(clauses.join(","));
  }

  const start = (page - 1) * PAYMENT_PAGE_SIZE;
  const { data, error, count } = await query
    .order("pay_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, start + PAYMENT_PAGE_SIZE - 1);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: {
      rows: ((data ?? []) as unknown as RawPayment[]).map(toListRow),
      total: count ?? 0,
      page,
      pageSize: PAYMENT_PAGE_SIZE,
    },
  };
}

// ── 收付款詳情 ───────────────────────────────────────────────

export interface PaymentAllocationDetail {
  id: string;
  amount: number;
  created_at: string;
  document_id: string;
  doc_no: string | null;
  doc_type: DocType | null;
  doc_date: string | null;
}

export interface PaymentDetail extends PaymentListRow {
  note: string | null;
  voided_at: string | null;
  created_at: string;
  allocations: PaymentAllocationDetail[];
}

type RawDetail = Omit<RawPayment, "erp_payment_allocations"> & {
  note: string | null;
  voided_at: string | null;
  created_at: string;
  erp_payment_allocations?:
    | {
        id: string;
        amount: number;
        created_at: string;
        document_id: string;
        document?:
          | {
              doc_no: string | null;
              doc_type: DocType;
              doc_date: string;
            }
          | {
              doc_no: string | null;
              doc_type: DocType;
              doc_date: string;
            }[]
          | null;
      }[]
    | null;
};

/** 單筆收付款 + 沖銷明細；找不到回 data: null。 */
export async function getPaymentDetail(
  id: string,
): Promise<ErpResult<PaymentDetail | null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_payments")
    .select(
      "id, direction, doc_no, pay_date, customer_id, vendor_id, method, amount, check_no, check_due_date, bank, check_status, status, void_reason, voided_at, note, created_at, customer:mx_customers(code, name), vendor:erp_vendors(code, name), erp_payment_allocations(id, amount, created_at, document_id, document:erp_documents(doc_no, doc_type, doc_date))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data) return { ok: true, data: null };
  const raw = data as unknown as RawDetail;
  const allocations = (raw.erp_payment_allocations ?? [])
    .map((a) => {
      const doc = Array.isArray(a.document) ? a.document[0] : a.document;
      return {
        id: a.id,
        amount: Number(a.amount),
        created_at: a.created_at,
        document_id: a.document_id,
        doc_no: doc?.doc_no ?? null,
        doc_type: doc?.doc_type ?? null,
        doc_date: doc?.doc_date ?? null,
      };
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    ok: true,
    data: {
      ...toListRow(raw),
      note: raw.note,
      voided_at: raw.voided_at,
      created_at: raw.created_at,
      allocations,
    },
  };
}

// ── 未沖銷單據 ───────────────────────────────────────────────

/** 對象的未沖銷單據（erp_document_balances，outstanding ≠ 0，舊→新）。 */
export async function listOutstandingDocuments(
  direction: PaymentDirection,
  partyId: string,
): Promise<ErpResult<ErpDocumentBalance[]>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!partyId) return { ok: true, data: [] };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_document_balances")
    .select(
      "document_id, doc_type, doc_no, doc_date, customer_id, vendor_id, total_twd, allocated, outstanding",
    )
    .eq(direction === "in" ? "customer_id" : "vendor_id", partyId)
    .in("doc_type", docTypesForDirection(direction))
    .neq("outstanding", 0)
    .order("doc_date", { ascending: true })
    .order("doc_no", { ascending: true });
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: ((data ?? []) as ErpDocumentBalance[]).map((d) => ({
      ...d,
      total_twd: Number(d.total_twd),
      allocated: Number(d.allocated),
      outstanding: Number(d.outstanding),
    })),
  };
}

// ── 對帳單 ───────────────────────────────────────────────────

export interface StatementPartyInfo {
  type: StatementParty["type"];
  id: string;
  code: string | null;
  name: string;
  invoice_title: string | null;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
}

export interface StatementData {
  party: StatementPartyInfo;
  statement: Statement;
}

const CHUNK = 1000;

/** 逐段讀完（PostgREST 單次上限 1000 列）。 */
async function fetchAll<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string; details?: string } | null;
  }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let start = 0; ; start += CHUNK) {
    const { data, error } = await run(start, start + CHUNK - 1);
    if (error) return { rows, error: erpErrorMessage(error) };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < CHUNK) break;
  }
  return { rows, error: null };
}

/**
 * 對帳單資料：對象基本資料 + buildStatement 結果。
 * 對帳單頁與 #178 的列印頁（/admin/erp/print/statement）共用。
 * 對象不存在回 data: null。
 */
export async function getStatementData(params: {
  party: StatementParty;
  from: string;
  to: string;
}): Promise<ErpResult<StatementData | null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const { party, from, to } = params;
  if (from > to) return { ok: false, error: "起日不可晚於迄日。" };
  const supabase = await getServerSupabase();

  // 對象
  let info: StatementPartyInfo | null = null;
  if (party.type === "customer") {
    const { data, error } = await supabase
      .from("mx_customers")
      .select(
        "id, code, name, invoice_title, tax_id, contact_person, phone, address, delivery_address",
      )
      .eq("id", party.id)
      .maybeSingle();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (data) {
      const c = data as {
        id: string;
        code: string | null;
        name: string;
        invoice_title: string | null;
        tax_id: string | null;
        contact_person: string | null;
        phone: string | null;
        address: string | null;
        delivery_address: string | null;
      };
      info = {
        type: "customer",
        id: c.id,
        code: c.code,
        name: c.name,
        invoice_title: c.invoice_title,
        tax_id: c.tax_id,
        contact_person: c.contact_person,
        phone: c.phone,
        fax: null,
        address: c.address ?? c.delivery_address,
      };
    }
  } else {
    const { data, error } = await supabase
      .from("erp_vendors")
      .select("id, code, name, tax_id, contact_person, phone, fax, address")
      .eq("id", party.id)
      .maybeSingle();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (data) {
      const v = data as Omit<StatementPartyInfo, "type" | "invoice_title">;
      info = { ...v, type: "vendor", invoice_title: null };
    }
  }
  if (!info) return { ok: true, data: null };

  const partyCol = party.type === "customer" ? "customer_id" : "vendor_id";
  const docTypes: DocType[] =
    party.type === "customer" ? ["S", "SR"] : ["I", "PR"];
  const direction: PaymentDirection = party.type === "customer" ? "in" : "out";
  const DOC_COLS =
    "id, doc_type, doc_no, doc_date, total_twd, status, invoice_no, note";
  const PAY_COLS =
    "id, doc_no, pay_date, method, amount, check_no, check_due_date, status, note";

  const docsBase = () =>
    supabase
      .from("erp_documents")
      .select(DOC_COLS)
      .eq(partyCol, party.id)
      .eq("status", "posted")
      .in("doc_type", docTypes);
  const paysBase = () =>
    supabase
      .from("erp_payments")
      .select(PAY_COLS)
      .eq(partyCol, party.id)
      .eq("direction", direction)
      .eq("status", "posted");

  const [openingDocs, docs, openingPayments, payments] = await Promise.all([
    fetchAll<StatementDocInput>((a, b) =>
      docsBase().lt("doc_date", from).order("id").range(a, b),
    ),
    fetchAll<StatementDocInput>((a, b) =>
      docsBase()
        .gte("doc_date", from)
        .lte("doc_date", to)
        .order("doc_date")
        .order("id")
        .range(a, b),
    ),
    fetchAll<StatementPaymentInput>((a, b) =>
      paysBase().lt("pay_date", from).order("id").range(a, b),
    ),
    fetchAll<StatementPaymentInput>((a, b) =>
      paysBase()
        .gte("pay_date", from)
        .lte("pay_date", to)
        .order("pay_date")
        .order("id")
        .range(a, b),
    ),
  ]);
  const failed = [openingDocs, docs, openingPayments, payments].find(
    (r) => r.error,
  );
  if (failed?.error) return { ok: false, error: failed.error };

  return {
    ok: true,
    data: {
      party: info,
      statement: buildStatement({
        openingDocs: openingDocs.rows,
        openingPayments: openingPayments.rows,
        docs: docs.rows,
        payments: payments.rows,
        from,
        to,
        partyType: party.type,
      }),
    },
  };
}
