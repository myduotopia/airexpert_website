// 週報追蹤資料（#272）表單輸入 → DB 列的正規化與驗證。純函式（client / server 共用；server action 會再跑一次）。
// 錯誤回 { ok:false, error, field }，field 供表單把錯誤顯示在對應欄位。
import {
  DELIVERY_STATUSES,
  MACHINE_ISSUE_STATUSES,
  REPAIR_STATUSES,
  TRACKING_LIMITS,
  type DeliveryJobInput,
  type DepositOverride,
  type MachineIssueInput,
  type ProgressInput,
  type RepairJobInput,
} from "./types";

export type NormalizeResult<Row, Input> =
  | { ok: true; row: Row }
  | { ok: false; error: string; field: keyof Input };

/** 合法的西元日期（YYYY-MM-DD，且為實際存在的日期）。 */
export function isIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 選填 id：非 uuid 一律視為未選。 */
function optionalId(v: string | null | undefined): string | null {
  return isUuid(v) ? v : null;
}

/** 去頭尾空白；空字串 → null。 */
function optionalText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

type DateCheck = { ok: true; value: string | null } | { ok: false };

function optionalDate(v: string | null | undefined): DateCheck {
  const t = (v ?? "").trim();
  if (t === "") return { ok: true, value: null };
  return isIsoDate(t) ? { ok: true, value: t } : { ok: false };
}

const TOO_LONG = (label: string, max: number) => `${label}最多 ${max} 字。`;

// ── 交機進度 ─────────────────────────────────────────────────

export interface DeliveryJobRowInput {
  customer_id: string;
  document_id: string | null;
  deposit_override: DepositOverride;
  sales_rep_id: string | null;
  delivery_owner_id: string | null;
  materials_confirmed: boolean;
  equipment: string | null;
  delivery_start: string | null;
  delivery_end: string | null;
  note: string | null;
  status: DeliveryJobInput["status"];
}

export function normalizeDeliveryInput(
  input: DeliveryJobInput,
): NormalizeResult<DeliveryJobRowInput, DeliveryJobInput> {
  if (!isUuid(input.customer_id)) {
    return { ok: false, error: "請選擇客戶。", field: "customer_id" };
  }
  if (!DELIVERY_STATUSES.includes(input.status)) {
    return { ok: false, error: "狀態不正確。", field: "status" };
  }
  const override = input.deposit_override;
  if (
    override !== null &&
    override !== "received" &&
    override !== "not_received"
  ) {
    return { ok: false, error: "訂金狀態不正確。", field: "deposit_override" };
  }
  const start = optionalDate(input.delivery_start);
  if (!start.ok) {
    return {
      ok: false,
      error: "交機時間（起）日期不正確。",
      field: "delivery_start",
    };
  }
  const end = optionalDate(input.delivery_end);
  if (!end.ok) {
    return {
      ok: false,
      error: "交機時間（迄）日期不正確。",
      field: "delivery_end",
    };
  }
  // 只填一端 → 單日
  const from = start.value ?? end.value;
  const to = end.value ?? start.value;
  if (from && to && to < from) {
    return {
      ok: false,
      error: "交機時間（迄）不可早於（起）。",
      field: "delivery_end",
    };
  }
  const equipment = optionalText(input.equipment);
  if (equipment && equipment.length > TRACKING_LIMITS.equipment) {
    return {
      ok: false,
      error: TOO_LONG("機器設備", TRACKING_LIMITS.equipment),
      field: "equipment",
    };
  }
  const note = optionalText(input.note);
  if (note && note.length > TRACKING_LIMITS.note) {
    return {
      ok: false,
      error: TOO_LONG("注意事項", TRACKING_LIMITS.note),
      field: "note",
    };
  }
  return {
    ok: true,
    row: {
      customer_id: input.customer_id,
      document_id: optionalId(input.document_id),
      deposit_override: override,
      sales_rep_id: optionalId(input.sales_rep_id),
      delivery_owner_id: optionalId(input.delivery_owner_id),
      materials_confirmed: input.materials_confirmed === true,
      equipment,
      delivery_start: from,
      delivery_end: to,
      note,
      status: input.status,
    },
  };
}

// ── 進廠維修 ─────────────────────────────────────────────────

export interface RepairJobRowInput {
  customer_id: string;
  received_on: string;
  model: string | null;
  description: string;
  owner_id: string | null;
  status: RepairJobInput["status"];
}

export function normalizeRepairInput(
  input: RepairJobInput,
): NormalizeResult<RepairJobRowInput, RepairJobInput> {
  if (!isUuid(input.customer_id)) {
    return { ok: false, error: "請選擇客戶。", field: "customer_id" };
  }
  const received = (input.received_on ?? "").trim();
  if (!isIsoDate(received)) {
    return { ok: false, error: "請填寫正確的進廠日期。", field: "received_on" };
  }
  const description = (input.description ?? "").trim();
  if (!description) {
    return { ok: false, error: "請填寫問題描述。", field: "description" };
  }
  if (description.length > TRACKING_LIMITS.description) {
    return {
      ok: false,
      error: TOO_LONG("問題描述", TRACKING_LIMITS.description),
      field: "description",
    };
  }
  const model = optionalText(input.model);
  if (model && model.length > TRACKING_LIMITS.model) {
    return {
      ok: false,
      error: TOO_LONG("機型", TRACKING_LIMITS.model),
      field: "model",
    };
  }
  if (!REPAIR_STATUSES.includes(input.status)) {
    return { ok: false, error: "狀態不正確。", field: "status" };
  }
  return {
    ok: true,
    row: {
      customer_id: input.customer_id,
      received_on: received,
      model,
      description,
      owner_id: optionalId(input.owner_id),
      status: input.status,
    },
  };
}

// ── 新機問題 ─────────────────────────────────────────────────

export interface MachineIssueRowInput {
  customer_id: string;
  machine_id: string | null;
  model: string | null;
  delivered_on: string | null;
  description: string;
  occurred_on: string;
  owner_id: string | null;
  status: MachineIssueInput["status"];
  is_key: boolean;
}

export function normalizeMachineIssueInput(
  input: MachineIssueInput,
): NormalizeResult<MachineIssueRowInput, MachineIssueInput> {
  if (!isUuid(input.customer_id)) {
    return { ok: false, error: "請選擇客戶。", field: "customer_id" };
  }
  const occurred = (input.occurred_on ?? "").trim();
  if (!isIsoDate(occurred)) {
    return { ok: false, error: "請填寫正確的發生日期。", field: "occurred_on" };
  }
  const delivered = optionalDate(input.delivered_on);
  if (!delivered.ok) {
    return { ok: false, error: "交機日期不正確。", field: "delivered_on" };
  }
  const description = (input.description ?? "").trim();
  if (!description) {
    return { ok: false, error: "請填寫問題描述。", field: "description" };
  }
  if (description.length > TRACKING_LIMITS.description) {
    return {
      ok: false,
      error: TOO_LONG("問題描述", TRACKING_LIMITS.description),
      field: "description",
    };
  }
  const model = optionalText(input.model);
  if (model && model.length > TRACKING_LIMITS.model) {
    return {
      ok: false,
      error: TOO_LONG("機型", TRACKING_LIMITS.model),
      field: "model",
    };
  }
  if (!MACHINE_ISSUE_STATUSES.includes(input.status)) {
    return { ok: false, error: "狀態不正確。", field: "status" };
  }
  return {
    ok: true,
    row: {
      customer_id: input.customer_id,
      machine_id: optionalId(input.machine_id),
      model,
      delivered_on: delivered.value,
      description,
      occurred_on: occurred,
      owner_id: optionalId(input.owner_id),
      status: input.status,
      is_key: input.is_key === true,
    },
  };
}

// ── 處理進度 ─────────────────────────────────────────────────

export function normalizeProgressInput(
  input: ProgressInput,
): NormalizeResult<ProgressInput, ProgressInput> {
  const date = (input.progress_date ?? "").trim();
  if (!isIsoDate(date)) {
    return { ok: false, error: "請填寫正確的日期。", field: "progress_date" };
  }
  const content = (input.content ?? "").trim();
  if (!content) {
    return { ok: false, error: "請填寫進度內容。", field: "content" };
  }
  if (content.length > TRACKING_LIMITS.content) {
    return {
      ok: false,
      error: TOO_LONG("進度內容", TRACKING_LIMITS.content),
      field: "content",
    };
  }
  return { ok: true, row: { progress_date: date, content } };
}
