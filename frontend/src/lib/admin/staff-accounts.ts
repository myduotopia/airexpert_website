// 員工帳號（#261）— 純函式與常數（無 server-only 依賴），server action、頁面與測試共用。
// 對應 supabase/migrations/0032_staff_rbac.sql（staff_email_for_code、position_permissions_module_check）。

import type { AdminModule } from "./auth";

/** 員工帳號的帳號設定頁（改密碼）。必改密碼的帳號一律被導到這裡。 */
export const ACCOUNT_SETTINGS_PATH = "/admin/settings/account";

/** 員工帳號的預設密碼（建立帳號與「重設為預設密碼」皆用此值；首登必改）。 */
export const DEFAULT_STAFF_PASSWORD = "00000000";

/**
 * 停用帳號的期間（Supabase Auth ban_duration；約 100 年 = 直到人事按「啟用帳號」）。
 * 建立後先停用（#263）、停用帳號、重設密碼時一併停用皆用此值；啟用 = ban_duration "none"。
 */
export const BAN_FOREVER = "876000h";

export const STAFF_EMAIL_DOMAIN = "airexpert.com.tw";

/** 新密碼最短長度。 */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt 只取前 72 bytes；超過時後面的字元不影響驗證，故直接拒絕。 */
export const PASSWORD_MAX_BYTES = 72;

/** 員工編號可用於 email 的字元（英數與 . _ -）。 */
const CODE_EMAIL_SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * 員工帳號 email：`<員工編號小寫>@airexpert.com.tw`（與 DB staff_email_for_code 一致：去頭尾空白、小寫）。
 * 沒有編號或編號含不可用於 email 的字元時回 null（不能建立帳號）。
 */
export function staffEmailFor(code: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  if (!c || !CODE_EMAIL_SAFE.test(c)) return null;
  return `${c.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

/** 可經職位授予的模組（顯示順序）。不含 hr：hr 只能由 admin 在人員管理頁直接授予。 */
export const POSITION_MODULES = [
  "erp",
  "service_report",
  "maintenance",
  "employees",
] as const satisfies readonly AdminModule[];

export type PositionModule = (typeof POSITION_MODULES)[number];

export function isPositionModule(v: unknown): v is PositionModule {
  return (
    typeof v === "string" && (POSITION_MODULES as readonly string[]).includes(v)
  );
}

/** 模組顯示名稱。 */
export const MODULE_LABELS: Record<AdminModule, string> = {
  erp: "ERP",
  service_report: "機台維護報告單",
  maintenance: "保養記錄卡",
  employees: "員工清單",
  hr: "人事（敏感資料）",
};

/** 模組說明（權限管理頁勾選時提示）。 */
export const MODULE_DESCRIPTIONS: Record<PositionModule, string> = {
  erp: "銷售、採購、庫存、收付款、報表與基本資料（含財務資料）",
  service_report: "機台維護報告單與保養方案",
  maintenance: "保養記錄卡與保養客戶",
  employees: "員工清單（非敏感資料，可新增與修改）",
};

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * 改密碼的輸入檢查（server action 在重新驗證目前密碼「之前」呼叫）。回傳錯誤訊息；通過回 null。
 * 規則：三欄必填；新密碼 ≥ 8 碼、≤ 72 bytes；不得為預設密碼 00000000；兩次輸入相同；不得與目前密碼相同。
 */
export function validatePasswordChange(
  input: PasswordChangeInput,
): string | null {
  const { current, next, confirm } = input;
  if (!current) return "請輸入目前密碼。";
  if (!next) return "請輸入新密碼。";
  if (next.length < PASSWORD_MIN_LENGTH) {
    return `新密碼至少需 ${PASSWORD_MIN_LENGTH} 個字元。`;
  }
  if (byteLength(next) > PASSWORD_MAX_BYTES) {
    return `新密碼過長（最多 ${PASSWORD_MAX_BYTES} 個英數字元）。`;
  }
  if (next === DEFAULT_STAFF_PASSWORD) return "新密碼不可為預設密碼。";
  if (next !== confirm) return "兩次輸入的新密碼不一致。";
  if (next === current) return "新密碼不可與目前密碼相同。";
  return null;
}

/**
 * 員工帳號狀態（權限管理頁「人員」頁籤）。「需改密碼」是另一個獨立標示（StaffPersonRow.must_change_password），
 * 已啟用與已停用的帳號都可能需改密碼（#263：帳號建立後預設停用，由人事啟用後員工才能以預設密碼登入改密碼）。
 */
export type StaffAccountStatus =
  | "none" // 未建立
  | "enabled" // 已啟用（可登入）
  | "disabled" // 已停用（Auth banned_until 在未來，無法登入）
  | "not_staff"; // 連結的不是員工帳號（共用／管理帳號，由管理員處理）

export const STAFF_ACCOUNT_STATUS_LABELS: Record<StaffAccountStatus, string> = {
  none: "未建立",
  enabled: "已啟用",
  disabled: "已停用",
  not_staff: "連結非員工帳號",
};

/** 「需改密碼」標示文字。 */
export const MUST_CHANGE_PASSWORD_LABEL = "需改密碼";

/** Auth 的 banned_until 是否仍在未來（= 已停用）。 */
export function isBanned(
  bannedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!bannedUntil) return false;
  const t = new Date(bannedUntil).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

export function staffAccountStatus(input: {
  linked: boolean;
  role: string | null;
  bannedUntil: string | null;
  now?: Date;
}): StaffAccountStatus {
  if (!input.linked) return "none";
  if (input.role !== "staff") return "not_staff";
  return isBanned(input.bannedUntil, input.now) ? "disabled" : "enabled";
}

/** 批次建立帳號的結果（server action 回傳；摘要文字見 batchCreateSummary）。 */
export type BatchCreateResult =
  | {
      ok: true;
      /** 本次是否選了「建立後先停用」。 */
      disabled: boolean;
      created: { name: string; email: string; disabled: boolean }[];
      failed: { name: string; error: string }[];
    }
  | { ok: false; error: string };

/** 批次建立的結果摘要，例：「已建立 3 個帳號（已停用）。」、「已建立 1 個帳號（已啟用），1 位失敗。」 */
export function batchCreateSummary(
  result: Extract<BatchCreateResult, { ok: true }>,
): string {
  const n = result.created.length;
  const state = n === 0 ? "" : result.disabled ? "（已停用）" : "（已啟用）";
  const failed = result.failed.length ? `，${result.failed.length} 位失敗` : "";
  return `已建立 ${n} 個帳號${state}${failed}。`;
}

/** 登入時 Auth 回「帳號已停用」（GoTrue user_banned）。 */
export function isUserBannedError(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  return (
    err.code === "user_banned" || /user is banned/i.test(err.message ?? "")
  );
}

/** Supabase Auth「email 已被註冊」的錯誤（建立帳號時不覆蓋，明確報錯）。 */
export function isEmailTakenError(
  err: { code?: string; message?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "email_exists" || err.code === "user_already_exists") {
    return true;
  }
  return /already (been )?registered|already exists/i.test(err.message ?? "");
}

/** 0032 的 RPC／觸發器錯誤（P0001 message）→ 中文訊息。 */
const STAFF_RPC_ERRORS: Record<string, string> = {
  forbidden: "沒有人事（hr）權限。",
  employee_not_found: "找不到此員工，請重新整理後再試。",
  employee_inactive: "只能替在職員工建立帳號。",
  employee_code_missing: "此員工沒有員工編號，無法建立帳號。",
  employee_code_invalid:
    "員工編號含不可用於 email 的字元（只能是英數與 . _ -），無法建立帳號。",
  employee_has_account: "此員工已有帳號。",
  account_email_mismatch: "登入帳號與員工編號不符。",
  account_exists: "此登入帳號已是後台帳號，未覆蓋。",
  account_not_new: "只能連結剛建立的登入帳號；既有的登入帳號請洽管理員處理。",
  employee_no_account: "此員工尚未建立帳號。",
  not_staff_account:
    "此員工連結的不是員工帳號（共用或管理帳號），請由管理員在人員管理頁處理。",
  position_assign_forbidden: "只有人事（hr）權限可以指派員工職位。",
  admin_unlink_forbidden:
    "此員工已有後台帳號，只有人事（hr）權限可以解除連結。",
};

export function staffRpcError(
  err: { message?: string; code?: string } | null | undefined,
  fallback = "操作失敗，請稍後再試。",
): string {
  const key = err?.message?.trim() ?? "";
  if (STAFF_RPC_ERRORS[key]) return STAFF_RPC_ERRORS[key];
  if (err?.code === "42501") return "沒有權限執行此操作。";
  return key ? `${fallback.replace(/。$/, "")}：${key}` : fallback;
}
