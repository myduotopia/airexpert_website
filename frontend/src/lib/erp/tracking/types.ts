// 週報追蹤資料（issue #272）型別與常數 — client / server 共用、純型別與常數。
// 對應 supabase/migrations/0038_meeting_tracking.sql 的 delivery_jobs、repair_jobs、machine_issues、
// tracking_progress 與清單 view（*_view、delivery_document_options）。
// date 欄位為 "YYYY-MM-DD"（西元、無時區）；numeric 經 PostgREST 以 number 回傳。

// ── 狀態 ─────────────────────────────────────────────────────

export type DeliveryStatus = "in_progress" | "delivered" | "cancelled";
export type RepairStatus =
  | "pending"
  | "inspecting"
  | "vendor"
  | "quoted"
  | "awaiting_customer"
  | "done"
  | "returned";
export type MachineIssueStatus =
  | "handling"
  | "awaiting_vendor"
  | "resolved"
  | "discussing";

/** 狀態（顯示順序）與 DB check 一致。 */
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "in_progress",
  "delivered",
  "cancelled",
];
export const REPAIR_STATUSES: readonly RepairStatus[] = [
  "pending",
  "inspecting",
  "vendor",
  "quoted",
  "awaiting_customer",
  "done",
  "returned",
];
export const MACHINE_ISSUE_STATUSES: readonly MachineIssueStatus[] = [
  "handling",
  "awaiting_vendor",
  "discussing",
  "resolved",
];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  in_progress: "進行中",
  delivered: "已交機",
  cancelled: "取消",
};
export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  pending: "待確認",
  inspecting: "檢修中",
  vendor: "送廠商檢修",
  quoted: "已報價",
  awaiting_customer: "待客戶回覆",
  done: "完成",
  returned: "退回",
};
export const MACHINE_ISSUE_STATUS_LABELS: Record<MachineIssueStatus, string> = {
  handling: "處理中",
  awaiting_vendor: "待原廠",
  discussing: "待討論",
  resolved: "已解決",
};

/** 結案狀態（「預設只看未結案」排除這些）。 */
export const DELIVERY_CLOSED: readonly DeliveryStatus[] = [
  "delivered",
  "cancelled",
];
export const REPAIR_CLOSED: readonly RepairStatus[] = ["done", "returned"];
export const MACHINE_ISSUE_CLOSED: readonly MachineIssueStatus[] = ["resolved"];

/** 三種追蹤資料。 */
export type TrackingKind = "delivery" | "repairs" | "machine-issues";

/** 處理進度所屬：repair = 進廠維修、issue = 新機問題。 */
export type ProgressParent = "repair" | "issue";

// ── 訂金 ─────────────────────────────────────────────────────

/** 訂金：已收／未收。 */
export type DepositStatus = "received" | "not_received";
/** delivery_jobs.deposit_override：null = 自動判斷。 */
export type DepositOverride = DepositStatus | null;

export const DEPOSIT_LABELS: Record<DepositStatus, string> = {
  received: "已收",
  not_received: "未收",
};

// ── 資料列（清單 view） ───────────────────────────────────────

export interface DeliveryJobRow {
  id: string;
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
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
  customer_code: string | null;
  customer_name: string;
  sales_rep_name: string | null;
  delivery_owner_name: string | null;
  doc_type: "Q" | "S" | null;
  doc_no: string | null;
  doc_status: "draft" | "posted" | "voided" | null;
  /** 連結單據相關已過帳銷貨單的已沖銷金額（連結 Q 時為由其轉出的 S）。 */
  linked_allocated: number;
  /** 客戶未沖銷預收。 */
  customer_prepaid: number;
}

export interface RepairJobRow {
  id: string;
  customer_id: string;
  received_on: string;
  model: string | null;
  description: string;
  owner_id: string | null;
  status: RepairStatus;
  created_at: string;
  updated_at: string;
  customer_code: string | null;
  customer_name: string;
  owner_name: string | null;
  latest_progress_date: string | null;
  latest_progress: string | null;
  progress_count: number;
}

export interface MachineIssueRow {
  id: string;
  customer_id: string;
  machine_id: string | null;
  model: string | null;
  delivered_on: string | null;
  description: string;
  occurred_on: string;
  owner_id: string | null;
  status: MachineIssueStatus;
  is_key: boolean;
  created_at: string;
  updated_at: string;
  customer_code: string | null;
  customer_name: string;
  machine_serial_no: string | null;
  owner_name: string | null;
  latest_progress_date: string | null;
  latest_progress: string | null;
  progress_count: number;
}

export interface ProgressEntry {
  id: string;
  progress_date: string;
  content: string;
  created_at: string;
}

/** 交機進度可連結的單據（delivery_document_options）。 */
export interface DeliveryDocumentOption {
  id: string;
  customer_id: string;
  doc_type: "Q" | "S";
  doc_no: string | null;
  doc_date: string;
  status: "draft" | "posted";
  total_twd: number;
  sales_rep_id: string | null;
  sales_rep: string | null;
  linked_allocated: number;
  /** 整機品項（erp_items.kind = machine）的品名，供「機器設備」預設帶入。 */
  machine_items: string[];
}

/** 新機問題可選的機台（mx_machines，同客戶）。 */
export interface MachineOption {
  id: string;
  serial_no: string;
  model: string | null;
  purchased_at: string | null;
}

// ── 表單輸入（日期為 YYYY-MM-DD 或空字串；選填 id 為 null） ───────

export interface DeliveryJobInput {
  customer_id: string | null;
  document_id: string | null;
  deposit_override: DepositOverride;
  sales_rep_id: string | null;
  delivery_owner_id: string | null;
  materials_confirmed: boolean;
  equipment: string;
  delivery_start: string;
  delivery_end: string;
  note: string;
  status: DeliveryStatus;
}

export interface RepairJobInput {
  customer_id: string | null;
  received_on: string;
  model: string;
  description: string;
  owner_id: string | null;
  status: RepairStatus;
}

export interface MachineIssueInput {
  customer_id: string | null;
  machine_id: string | null;
  model: string;
  delivered_on: string;
  description: string;
  occurred_on: string;
  owner_id: string | null;
  status: MachineIssueStatus;
  is_key: boolean;
}

export interface ProgressInput {
  progress_date: string;
  content: string;
}

/** 文字長度上限（與 0038 的 check 一致）。 */
export const TRACKING_LIMITS = {
  equipment: 500,
  note: 1000,
  description: 2000,
  model: 100,
  content: 2000,
} as const;
