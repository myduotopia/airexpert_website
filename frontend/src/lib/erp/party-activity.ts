// 客戶／廠商詳情頁「相關單據」（#267）的純函式：網址參數、篩選、分頁、列的顯示文字與連結。
// client / server / 測試共用。資料由 DB RPC erp_party_activity（0036）合併單據與收付款後分頁回傳，
// 讀取見 lib/erp/queries/party-activity.ts；畫面見 components/erp/PartyActivity.tsx。
import {
  DIRECTION_META,
  isOffsetAmount,
} from "@/app/admin/(protected)/erp/collections/_components/allocation";
import { rocDate } from "@/lib/admin/minguo";
import { docStatusLabel } from "./display";
import { DOC_TYPE_LABEL } from "./doc-no";
import { DOC_LIST_PATH } from "./print";
import type { DocStatus, PartyType } from "./types";

/** 每頁筆數。 */
export const PARTY_ACTIVITY_PAGE_SIZE = 20;

/** 網址參數名稱（加 docs_ 前綴，避免和頁面上其他參數衝突）。 */
export const PARTY_ACTIVITY_PARAM = {
  page: "docs_page",
  type: "docs_type",
  voided: "docs_voided",
} as const;

/** 區塊錨點：換頁／篩選後捲回區塊。 */
export const PARTY_ACTIVITY_ANCHOR = "party-activity";

/** 單據單別（客戶 Q/S/SR；廠商 P/I/PR）。 */
export type ActivityDocumentType = "Q" | "S" | "SR" | "P" | "I" | "PR";
/** 收付款類別：收款 RC（含 0 元沖抵單）、客戶退款 RF、付款 PM（含沖抵單）、廠商退款 VR。 */
export type ActivityPaymentType = "RC" | "RF" | "PM" | "VR";
export type ActivityType = ActivityDocumentType | ActivityPaymentType;

/** RPC 回傳的一列。 */
export interface PartyActivityRow {
  kind: "document" | "payment";
  id: string;
  doc_type: ActivityType;
  /** 草稿為 null。 */
  doc_no: string | null;
  /** 單據日期／收付款日期（YYYY-MM-DD）。 */
  date: string;
  status: DocStatus;
  /** 單據 total_twd（SR／PR 為正數，同單據畫面）；收付款金額。 */
  amount_twd: number;
  /** 已過帳 S/SR/I/PR 的未沖餘額（SR／PR 為負）；其餘 null。 */
  outstanding: number | null;
  /** 已過帳收款／付款的未沖銷（預收／預付）；退款單與作廢 null。 */
  unallocated: number | null;
  created_at: string;
}

export interface PartyActivityResult {
  total: number;
  rows: PartyActivityRow[];
}

/** 篩選：全部、各單別、收付款（pay）。 */
export type PartyActivityFilter = "all" | ActivityDocumentType | "pay";

export interface PartyActivityParams {
  page: number;
  filter: PartyActivityFilter;
  includeVoided: boolean;
}

const PARTY_DOC_TYPES: Record<PartyType, ActivityDocumentType[]> = {
  customer: ["Q", "S", "SR"],
  vendor: ["P", "I", "PR"],
};

const PARTY_PAYMENT_TYPES: Record<PartyType, ActivityPaymentType[]> = {
  customer: ["RC", "RF"],
  vendor: ["PM", "VR"],
};

const PAYMENT_DIRECTION: Record<ActivityPaymentType, "in" | "out"> = {
  RC: "in",
  RF: "in",
  PM: "out",
  VR: "out",
};

/** 單別／收付款類別的中文名稱。 */
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  Q: DOC_TYPE_LABEL.Q,
  S: DOC_TYPE_LABEL.S,
  SR: DOC_TYPE_LABEL.SR,
  P: DOC_TYPE_LABEL.P,
  I: DOC_TYPE_LABEL.I,
  PR: DOC_TYPE_LABEL.PR,
  RC: DIRECTION_META.in.label,
  RF: DIRECTION_META.in.refundLabel,
  PM: DIRECTION_META.out.label,
  VR: DIRECTION_META.out.refundLabel,
};

/** 篩選選項（依對象）。 */
export function partyActivityFilters(
  partyType: PartyType,
): { value: PartyActivityFilter; label: string }[] {
  const pay = partyType === "customer" ? "收款／退款" : "付款／退款";
  return [
    { value: "all", label: "全部" },
    ...PARTY_DOC_TYPES[partyType].map((t) => ({
      value: t,
      label: DOC_TYPE_LABEL[t],
    })),
    { value: "pay", label: pay },
  ];
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** 網址參數 → 頁碼／篩選／是否顯示作廢；無效值回預設（第 1 頁、全部、不含作廢）。 */
export function parsePartyActivityParams(
  raw: RawParams,
  partyType: PartyType,
): PartyActivityParams {
  const pageText = first(raw[PARTY_ACTIVITY_PARAM.page]);
  const page = /^\d{1,6}$/.test(pageText) ? Number(pageText) : 0;
  const type = first(raw[PARTY_ACTIVITY_PARAM.type]);
  const valid = partyActivityFilters(partyType).some((f) => f.value === type);
  return {
    page: page >= 1 ? page : 1,
    filter: valid ? (type as PartyActivityFilter) : "all",
    includeVoided: first(raw[PARTY_ACTIVITY_PARAM.voided]) === "1",
  };
}

/** 篩選 → RPC 的 p_doc_types（全部回 null）。 */
export function activityDocTypes(
  partyType: PartyType,
  filter: PartyActivityFilter,
): ActivityType[] | null {
  if (filter === "all") return null;
  if (filter === "pay") return [...PARTY_PAYMENT_TYPES[partyType]];
  return [filter];
}

/** 總頁數（至少 1）。 */
export function activityPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PARTY_ACTIVITY_PAGE_SIZE));
}

/**
 * 換頁／切換篩選的連結：保留頁面上其他網址參數，只改 docs_*；預設值（第 1 頁、全部、不含作廢）不帶。
 * 切換篩選或作廢時回到第 1 頁。結尾帶錨點捲回區塊。
 */
export function partyActivityHref(
  basePath: string,
  raw: RawParams,
  patch: Partial<PartyActivityParams>,
): string {
  const current = {
    page: first(raw[PARTY_ACTIVITY_PARAM.page]),
    type: first(raw[PARTY_ACTIVITY_PARAM.type]),
    voided: first(raw[PARTY_ACTIVITY_PARAM.voided]),
  };
  const filterChanged = "filter" in patch || "includeVoided" in patch;
  const page = patch.page ?? (filterChanged ? 1 : Number(current.page) || 1);
  const type = patch.filter ?? (current.type || "all");
  const voided = patch.includeVoided ?? current.voided === "1";

  const sp = new URLSearchParams();
  const ours = new Set<string>(Object.values(PARTY_ACTIVITY_PARAM));
  for (const [k, v] of Object.entries(raw)) {
    if (ours.has(k) || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) sp.append(k, item);
  }
  if (type !== "all") sp.set(PARTY_ACTIVITY_PARAM.type, type);
  if (voided) sp.set(PARTY_ACTIVITY_PARAM.voided, "1");
  if (page > 1) sp.set(PARTY_ACTIVITY_PARAM.page, String(page));
  const qs = sp.toString();
  return `${basePath}${qs ? `?${qs}` : ""}#${PARTY_ACTIVITY_ANCHOR}`;
}

/** 一列的顯示內容。 */
export interface ActivityRowView {
  key: string;
  dateText: string;
  typeLabel: string;
  docNoText: string;
  statusText: string;
  /** 收付款標示：金額 0 的收付款 =「沖抵」、退款單 =「退款」。 */
  tag: "沖抵" | "退款" | null;
  /** 金額（TWD）：退款單以負數顯示（同收付款列表）。 */
  amount: number;
  /** 未沖餘額（單據）或未沖銷（收付款）；不適用為 null（顯示「—」）。 */
  open: number | null;
  voided: boolean;
  href: string;
}

function isPaymentType(t: ActivityType): t is ActivityPaymentType {
  return Object.hasOwn(PAYMENT_DIRECTION, t);
}

export function activityRowView(row: PartyActivityRow): ActivityRowView {
  const voided = row.status === "voided";
  const base = {
    key: `${row.kind}:${row.id}`,
    dateText: rocDate(row.date),
    typeLabel: ACTIVITY_TYPE_LABEL[row.doc_type] ?? row.doc_type,
    voided,
  };
  if (row.kind === "payment" && isPaymentType(row.doc_type)) {
    const refund = row.doc_type === "RF" || row.doc_type === "VR";
    const meta = DIRECTION_META[PAYMENT_DIRECTION[row.doc_type]];
    return {
      ...base,
      docNoText: row.doc_no ?? "—",
      statusText: voided ? "已作廢" : "已過帳",
      tag: refund ? "退款" : isOffsetAmount(row.amount_twd) ? "沖抵" : null,
      amount: refund ? -row.amount_twd : row.amount_twd,
      open: refund || voided ? null : row.unallocated,
      href: `${meta.basePath}/${row.id}`,
    };
  }
  const docType = row.doc_type as ActivityDocumentType;
  return {
    ...base,
    docNoText: row.doc_no ?? "草稿",
    statusText: docStatusLabel(row.status, docType),
    tag: null,
    amount: row.amount_twd,
    open: row.outstanding,
    href: `${DOC_LIST_PATH[docType]}/${row.id}`,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : num(v);
}

/** RPC 回傳的 jsonb → 型別化結果（numeric 可能是字串）。 */
export function normalizeActivityResult(data: unknown): PartyActivityResult {
  const obj = (data ?? {}) as { total?: unknown; rows?: unknown };
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  return {
    total: num(obj.total),
    rows: rows.map((r: PartyActivityRow) => ({
      kind: r.kind,
      id: r.id,
      doc_type: r.doc_type,
      doc_no: r.doc_no ?? null,
      date: r.date,
      status: r.status,
      amount_twd: num(r.amount_twd),
      outstanding: numOrNull(r.outstanding),
      unallocated: numOrNull(r.unallocated),
      created_at: r.created_at,
    })),
  };
}
