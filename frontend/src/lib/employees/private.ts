// 員工敏感資料（#257，0031 employee_private）— client / server / 測試共用的純邏輯。
// 明文只會經 hr_reveal_employee_private 回到 hr 使用者；一般讀取（hr_get_employee_private）只拿遮罩值。
// maskPrivateValue 與 DB hr_mask_private 規則一致（匯入預覽時在瀏覽器端遮罩，畫面上不顯示明文）。

export type PrivateField =
  | "national_id"
  | "household_address"
  | "emergency_contact"
  | "marital"
  | "education"
  | "experience";

/** 敏感欄位（顯示順序）。與 DB hr_private_fields() 一致。 */
export const PRIVATE_FIELDS: readonly PrivateField[] = [
  "national_id",
  "household_address",
  "emergency_contact",
  "marital",
  "education",
  "experience",
];

export const PRIVATE_FIELD_LABELS: Record<PrivateField, string> = {
  national_id: "身份證號",
  household_address: "戶籍地址",
  emergency_contact: "聯絡人（原文）",
  marital: "婚姻",
  education: "學歷",
  experience: "經歷",
};

/** 長度上限（與 DB hr_clean_private 一致）。 */
export const PRIVATE_FIELD_MAX: Record<PrivateField, number> = {
  national_id: 20,
  household_address: 200,
  emergency_contact: 500,
  marital: 20,
  education: 500,
  experience: 2000,
};

/** 多行輸入的欄位。 */
export const PRIVATE_MULTILINE: ReadonlySet<PrivateField> = new Set([
  "emergency_contact",
  "education",
  "experience",
]);

/** 「顯示」後恢復遮罩的秒數（離開頁面、切到其他分頁也會立即恢復）。 */
export const REVEAL_SECONDS = 30;

export function isPrivateField(v: unknown): v is PrivateField {
  return (
    typeof v === "string" && (PRIVATE_FIELDS as readonly string[]).includes(v)
  );
}

export type PrivateValues = Partial<Record<PrivateField, string>>;

/** hr_get_employee_private 的回傳（遮罩值；null = 未填寫）。 */
export interface PrivateView {
  employee_id: string;
  exists: boolean;
  updated_at: string | null;
  fields: Record<PrivateField, string | null>;
}

/** RPC 回傳 → PrivateView（欄位缺漏視為未填寫）。 */
export function toPrivateView(raw: unknown): PrivateView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const f = (r.fields ?? {}) as Record<string, unknown>;
  const fields = Object.fromEntries(
    PRIVATE_FIELDS.map((k) => [k, typeof f[k] === "string" ? f[k] : null]),
  ) as Record<PrivateField, string | null>;
  return {
    employee_id: String(r.employee_id ?? ""),
    exists: r.exists === true,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
    fields,
  };
}

/** 遮罩值的顯示文字（null → 未填寫）。 */
export function privateDisplay(masked: string | null | undefined): string {
  return masked ?? "未填寫";
}

/**
 * 遮罩（與 DB hr_mask_private 一致）：
 *   national_id       ≥ 6 碼：前 3 + *（長度−5）+ 末 2；3–5 碼：首碼 + *；≤ 2 碼：全 *
 *   household_address 去郵遞區號後只留「縣市＋鄉鎮市區」+「…」；對不到 → 「已填寫」
 *   emergency_contact 「已填寫（N 字）」
 *   marital           「已填寫」
 *   education／experience 前 min(4, floor(N/2)) 字 + 「…」
 * 空值 → null。
 */
export function maskPrivateValue(
  field: PrivateField,
  value: string | null | undefined,
): string | null {
  let v = (value ?? "").trim();
  if (!v) return null;
  switch (field) {
    case "national_id": {
      v = v.replace(/[\s　]+/g, "").toUpperCase();
      const n = [...v].length;
      if (n <= 2) return "*".repeat(n);
      if (n <= 5) return v.slice(0, 1) + "*".repeat(n - 1);
      return v.slice(0, 3) + "*".repeat(n - 5) + v.slice(-2);
    }
    case "household_address": {
      v = v.replace(/^[0-9０-９\s-]+/, "");
      const m = /^([^縣市]{1,4}[縣市])([^鄉鎮市區]{1,4}[鄉鎮市區])?/.exec(v);
      if (!m) return "已填寫";
      return `${m[1]}${m[2] ?? ""}…`;
    }
    case "emergency_contact":
      return `已填寫（${[...v].length} 字）`;
    case "marital":
      return "已填寫";
    case "education":
    case "experience": {
      const chars = [...v];
      const k = Math.min(4, Math.floor(chars.length / 2));
      return chars.slice(0, k).join("") + "…";
    }
  }
}

/**
 * 「編輯敏感資料」表單 → hr_upsert_employee_private 的 fields：
 *   輸入框留白且未勾「清除」→ 不送（不變）；勾「清除」→ 送 null（清除）；有輸入 → 送去頭尾空白後的值。
 * 編輯表單不預填明文（避免明文出現在頁面）；要修改就整段重新輸入。
 */
export function buildPrivatePatch(
  values: PrivateValues,
  clear: ReadonlySet<PrivateField> | readonly PrivateField[] = [],
): Partial<Record<PrivateField, string | null>> {
  const clearSet = new Set(clear);
  const out: Partial<Record<PrivateField, string | null>> = {};
  for (const f of PRIVATE_FIELDS) {
    if (clearSet.has(f)) {
      out[f] = null;
      continue;
    }
    const v = (values[f] ?? "").trim();
    if (v) out[f] = v;
  }
  return out;
}

/** 修改內容的長度檢查（送出前；DB 另有相同檢查）。 */
export function privatePatchError(
  patch: Partial<Record<PrivateField, string | null>>,
): string | null {
  for (const f of PRIVATE_FIELDS) {
    const v = patch[f];
    if (typeof v === "string" && [...v].length > PRIVATE_FIELD_MAX[f]) {
      return `${PRIVATE_FIELD_LABELS[f]}不可超過 ${PRIVATE_FIELD_MAX[f]} 字。`;
    }
  }
  return null;
}

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export const HR_FORBIDDEN_MESSAGE =
  "沒有人事（hr）權限，無法查看或修改敏感資料。";
export const HR_KEY_MISSING_MESSAGE =
  "敏感資料加密金鑰尚未設定，暫時無法查看或修改，請聯絡系統管理者。";
export const HR_DECRYPT_FAILED_MESSAGE =
  "敏感資料無法解密（加密金鑰可能已變更），請聯絡系統管理者。";

/** hr_* RPC 錯誤 → 中文訊息（raise exception message = 代碼、detail = 說明）。 */
export function hrRpcError(err: DbError | null | undefined): string {
  const msg = err?.message ?? "";
  if (msg === "forbidden" || err?.code === "42501") return HR_FORBIDDEN_MESSAGE;
  if (msg === "hr_key_missing") return HR_KEY_MISSING_MESSAGE;
  if (msg === "hr_decrypt_failed") return HR_DECRYPT_FAILED_MESSAGE;
  if (msg === "not_found") return "找不到此員工，請重新整理後再試。";
  if (msg === "validation") {
    return err?.details?.trim() || "敏感資料格式不正確。";
  }
  return msg ? `操作失敗：${msg}` : "操作失敗，請稍後再試。";
}

export const ACCESS_ACTION_LABELS: Record<string, string> = {
  reveal: "顯示",
  write: "修改",
  import: "匯入",
};

/** employee_private_access_log 的一列（hr 才讀得到）。 */
export interface PrivateAccessLog {
  id: number;
  actor_email: string | null;
  actor_role: string;
  field: string;
  action: string;
  at: string;
}

/** 已顯示的明文：欄位 → { 明文, 恢復遮罩的時間（ms） }。 */
export type RevealState = Partial<
  Record<PrivateField, { value: string | null; until: number }>
>;

export function addReveal(
  state: RevealState,
  field: PrivateField,
  value: string | null,
  now: number,
  seconds: number = REVEAL_SECONDS,
): RevealState {
  return { ...state, [field]: { value, until: now + seconds * 1000 } };
}

/** 去掉已到期的明文（到期即恢復遮罩）；沒有變動時回傳原物件（避免多餘 re-render）。 */
export function pruneReveals(state: RevealState, now: number): RevealState {
  let changed = false;
  const next: RevealState = {};
  for (const f of PRIVATE_FIELDS) {
    const r = state[f];
    if (!r) continue;
    if (r.until <= now) {
      changed = true;
      continue;
    }
    next[f] = r;
  }
  return changed ? next : state;
}

/** 剩餘秒數（無條件進位；已到期 → 0）。 */
export function revealSecondsLeft(
  state: RevealState,
  field: PrivateField,
  now: number,
): number {
  const r = state[field];
  return r ? Math.max(0, Math.ceil((r.until - now) / 1000)) : 0;
}
