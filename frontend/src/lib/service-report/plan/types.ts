// 保養方案（Service Plan）型別與標籤 — client / server 共用（純型別與常數）。
// 欄位對應 supabase/migrations/0022_service_plan.sql；語意見
// docs/superpowers/specs/2026-09-29-service-plan-design.md §4。

/** 階段料件一列：品名／數量（文字）／單位（僅方案頁顯示，帶入時與數量組字）。 */
export interface PlanPart {
  name: string;
  qty: string;
  unit?: string;
}

/** sr_service_plans 資料列。 */
export interface ServicePlan {
  id: string;
  name: string;
  /** 適用馬力標籤（如 ['20HP','20']）；比對前一律正規化（見 match.normalizeHpTag）。 */
  hp_tags: string[];
  active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** sr_service_plan_stages 資料列。 */
export interface ServicePlanStage {
  id: string;
  plan_id: string;
  hours: number;
  label: string;
  parts: PlanPart[];
  created_at?: string;
  updated_at?: string;
}

/** 方案 + 依時數由小到大排好的階段（方案列表 / 編輯頁）。 */
export interface ServicePlanWithStages extends ServicePlan {
  stages: ServicePlanStage[];
}

/** sr_machine_plans 資料列：逐台指定方案（覆寫馬力比對）。 */
export interface MachinePlanOverride {
  machine_id: string;
  plan_id: string;
  updated_at: string;
}

/** 一筆可用的時數抄表（已解析為數字）。date 為西元 ISO "YYYY-MM-DD"。 */
export interface HoursReading {
  date: string;
  hours: number;
  /** record＝保養卡 mx_records.hours；report＝報告單 results.compressor.run_hours。 */
  source: "record" | "report";
}

/** 方案來源：override＝逐台指定、hp＝馬力比對、null＝沒有方案。 */
export type PlanMatchSource = "override" | "hp" | null;

export type ReminderStatus = "due" | "upcoming";

/** 提醒清單一列（列表頁提醒區塊所需的全部資料）。 */
export interface StageReminder {
  machine_id: string;
  customer_id: string | null;
  customer_name: string;
  /** 機台顯示文字：「代號-機號」，皆缺時用型號。 */
  machine_label: string;
  plan_id: string;
  plan_name: string;
  stage_id: string;
  stage_hours: number;
  /** 階段名稱（如「基礎保養」）。 */
  stage_name: string;
  /** 階段完整顯示文字（如「4000 小時 基礎保養」）。 */
  stage_label: string;
  latest_hours: number;
  latest_date: string;
  latest_source: HoursReading["source"];
  status: ReminderStatus;
  /** 預估到期日（西元 ISO）；status="due" 或無法推估時為 null。 */
  due_date: string | null;
}

/* --------------------------------------------------------- action 輸入 */

/** 方案新增 / 編輯輸入（無 id＝新增）。 */
export interface ServicePlanInput {
  id?: string | null;
  name: string;
  hp_tags: string[];
  active: boolean;
  note?: string | null;
}

/** 階段新增 / 編輯輸入（無 id＝新增）。hours 允許字串（表單輸入）。 */
export interface ServicePlanStageInput {
  id?: string | null;
  plan_id: string;
  hours: number | string;
  label: string;
  parts: PlanPart[];
}

/* ------------------------------------------------------------ 標籤常數 */

export const PLAN_ACTIVE_LABELS: Record<"active" | "inactive", string> = {
  active: "啟用",
  inactive: "停用",
};

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  due: "已達門檻",
  upcoming: "即將到期",
};

export const PLAN_MATCH_SOURCE_LABELS: Record<"override" | "hp", string> = {
  override: "逐台指定",
  hp: "馬力比對",
};

/** 提醒的預設展望天數（spec §5.6：14 天內到期才提醒）。 */
export const REMINDER_HORIZON_DAYS = 14;

/** 使用速度推估的取樣上限與門檻（spec §5.5）。 */
export const RATE_SAMPLE_SIZE = 6;
export const RATE_MIN_DAYS = 7;
export const RATE_MIN = 0.1;
export const RATE_MAX = 24;

/** 時數上限（與 DB check 相同）。 */
export const MAX_HOURS = 1_000_000;

/** 方案 / 階段欄位長度上限（字元）。 */
export const PLAN_TEXT_LIMITS = {
  name: 50,
  note: 500,
  hp_tag: 20,
  stage_label: 50,
  part_name: 50,
  part_qty: 20,
  part_unit: 10,
} as const;

/** 一個方案最多幾個馬力標籤 / 一個階段最多幾列料件。 */
export const MAX_HP_TAGS = 20;
export const MAX_STAGE_PARTS = 20;
