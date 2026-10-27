// 員工帳號登入 email 一次性套用（#265）的純邏輯：scripts/update-staff-emails.ts 使用，單元測試直接測本檔。
// 不含任何真實資料；不 import server-only 模組（腳本以 tsx 在 Node 執行）。
//
// 試算表：以標題名稱找「員工編號」與「Email」兩欄（不看欄位位置，其他欄一律不讀，例如員工名稱）。
// 比對：依員工編號（去空白、不分大小寫，與 DB employees_code_key 相同）找員工連結的 staff 帳號
//   （employees.admin_profile_id → admin_profiles；不由 email 推回）。
// 輸出：email 一律遮罩（maskEmail），不印姓名。
import {
  isEmailTakenError,
  maskEmail,
  normalizeLoginEmail,
} from "./staff-accounts";

/** DB 快照（每位有員工編號的員工一列；未連結帳號時 user_id 等為 null）。 */
export interface StaffAccountSnapshot {
  employee_id: string;
  code: string;
  user_id: string | null;
  role: string | null;
  /** auth.users.email（小寫）。 */
  auth_email: string | null;
  /** admin_profiles.email（小寫）。 */
  profile_email: string | null;
}

export type EmailColumns =
  | { ok: true; headerRow: number; codeCol: number; emailCol: number }
  | { ok: false; error: string };

export type EmailPlanRow =
  | {
      /** Excel 列號（1 起算）。 */
      line: number;
      code: string;
      action: "update";
      employee_id: string;
      user_id: string;
      /** 目前的登入 email（Auth）。 */
      from: string | null;
      /** 新 email（已正規化）。 */
      to: string;
    }
  | {
      line: number;
      code: string;
      action: "skip" | "error";
      reason: string;
      /** 目前的登入 email（有對到帳號時）。 */
      from?: string | null;
    };

export const EMAIL_PLAN_ACTION_LABELS: Record<EmailPlanRow["action"], string> =
  {
    update: "更新",
    skip: "略過",
    error: "錯誤",
  };

/** 找標題列的範圍（前 N 列）。 */
const HEADER_SCAN_ROWS = 20;

function headerKey(v: string): string {
  return v.replace(/[\s\-_－＿]/g, "").toLowerCase();
}

const CODE_HEADERS = new Set(["員工編號"]);
const EMAIL_HEADERS = new Set(["email", "電子郵件", "電子信箱"]);

/** 以標題名稱找「員工編號」與「Email」兩欄（取前 20 列中第一個兩者都有的列）。 */
export function findEmailColumns(grid: string[][]): EmailColumns {
  for (let r = 0; r < Math.min(grid.length, HEADER_SCAN_ROWS); r++) {
    const keys = (grid[r] ?? []).map((c) => headerKey(String(c ?? "")));
    const codeCols = keys.flatMap((k, i) => (CODE_HEADERS.has(k) ? [i] : []));
    const emailCols = keys.flatMap((k, i) => (EMAIL_HEADERS.has(k) ? [i] : []));
    if (codeCols.length === 0 || emailCols.length === 0) continue;
    if (codeCols.length > 1) {
      return { ok: false, error: `第 ${r + 1} 列有多個「員工編號」欄。` };
    }
    if (emailCols.length > 1) {
      return { ok: false, error: `第 ${r + 1} 列有多個 Email 欄。` };
    }
    return {
      ok: true,
      headerRow: r,
      codeCol: codeCols[0],
      emailCol: emailCols[0],
    };
  }
  return {
    ok: false,
    error: `前 ${HEADER_SCAN_ROWS} 列找不到同時有「員工編號」與「Email」的標題列。`,
  };
}

function codeKey(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * 每一列的動作。檢查順序：缺編號 → 檔案內編號重複 → 找不到員工 → 沒有 email（略過）→ email 格式 →
 * 尚未建立帳號 → 不是員工帳號 → 檔案內 email 重複 → 與目前相同（略過）→ 已是其他帳號的 email → 更新。
 * taken：其他帳號已使用的 email（auth.users ∪ admin_profiles，小寫）→ 帳號 id。
 */
export function buildEmailUpdatePlan(
  grid: string[][],
  cols: Extract<EmailColumns, { ok: true }>,
  accounts: StaffAccountSnapshot[],
  taken: ReadonlyMap<string, string>,
): EmailPlanRow[] {
  const byCode = new Map(accounts.map((a) => [codeKey(a.code), a]));
  const rows = grid
    .slice(cols.headerRow + 1)
    .map((r, i) => ({
      line: cols.headerRow + 2 + i,
      code: String(r?.[cols.codeCol] ?? "").trim(),
      rawEmail: String(r?.[cols.emailCol] ?? "").trim(),
    }))
    .filter((r) => r.code || r.rawEmail);

  const codeCount = new Map<string, number>();
  const emailCount = new Map<string, number>();
  for (const r of rows) {
    if (r.code) {
      codeCount.set(codeKey(r.code), (codeCount.get(codeKey(r.code)) ?? 0) + 1);
    }
    const n = normalizeLoginEmail(r.rawEmail);
    if (n.ok) emailCount.set(n.email, (emailCount.get(n.email) ?? 0) + 1);
  }

  return rows.map((r): EmailPlanRow => {
    const base = { line: r.line, code: r.code || "—" };
    const err = (reason: string, from?: string | null): EmailPlanRow => ({
      ...base,
      action: "error",
      reason,
      ...(from !== undefined ? { from } : {}),
    });
    if (!r.code) return err("缺少員工編號");
    const a = byCode.get(codeKey(r.code));
    // 顯示 DB 的編號寫法（檔案可能是小寫）。
    if (a) base.code = a.code;
    if ((codeCount.get(codeKey(r.code)) ?? 0) > 1) {
      return err("檔案內員工編號重複，請只保留一列");
    }
    if (!a) return err("找不到此員工編號");
    const from = a.auth_email;
    if (!r.rawEmail) {
      return {
        ...base,
        action: "skip",
        reason: "沒有 email，維持原帳號",
        from,
      };
    }
    const n = normalizeLoginEmail(r.rawEmail);
    if (!n.ok) return err(n.error.replace(/。$/, ""), from);
    if (!a.user_id) return err("此員工尚未建立帳號");
    if (a.role !== "staff") {
      return err(
        "此員工連結的不是員工帳號（共用或管理帳號），請由管理員處理",
        from,
      );
    }
    if ((emailCount.get(n.email) ?? 0) > 1) {
      return err("檔案內 email 重複（多位員工同一個 email）", from);
    }
    if (a.auth_email === n.email && a.profile_email === n.email) {
      return {
        ...base,
        action: "skip",
        reason: "與目前的登入 email 相同",
        from,
      };
    }
    const owner = taken.get(n.email);
    if (owner && owner !== a.user_id) {
      return err("此 email 已是其他帳號的登入 email", from);
    }
    return {
      ...base,
      action: "update",
      employee_id: a.employee_id,
      user_id: a.user_id,
      from,
      to: n.email,
    };
  });
}

export function summarizeEmailPlan(plan: EmailPlanRow[]): {
  update: number;
  skip: number;
  error: number;
} {
  const s = { update: 0, skip: 0, error: 0 };
  for (const r of plan) s[r.action]++;
  return s;
}

/** 一列的輸出文字：列號、編號、動作、遮罩 email、原因。不含姓名與原始 email。 */
export function formatPlanLine(r: EmailPlanRow): string {
  const head = `第 ${String(r.line).padStart(3)} 列  ${r.code.padEnd(6)}  ${EMAIL_PLAN_ACTION_LABELS[r.action]}`;
  if (r.action === "update") {
    return `${head}  ${maskEmail(r.from) || "（無）"} → ${maskEmail(r.to)}`;
  }
  const current = r.from ? `  目前 ${maskEmail(r.from)}` : "";
  return `${head}  ${r.reason}${current}`;
}

export type GotrueResult =
  | { ok: true }
  | { ok: false; taken: boolean; error: string };

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<Response>;

/**
 * 以 GoTrue admin API 更新登入 email（PUT /auth/v1/admin/users/<id>，email_confirm: true 不寄確認信）。
 * 直接用 fetch：Node 20 沒有原生 WebSocket，supabase-js 的 createClient 會因 realtime 報錯。
 * 錯誤訊息不含 email。
 */
export async function gotrueUpdateEmail(
  fetchImpl: FetchLike,
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  email: string,
): Promise<GotrueResult> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "PUT",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, email_confirm: true }),
    });
  } catch (e) {
    return {
      ok: false,
      taken: false,
      error: (e as Error)?.message || "無法連線 Auth",
    };
  }
  if (res.ok) return { ok: true };
  let body: {
    error_code?: string;
    code?: unknown;
    msg?: string;
    message?: string;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 非 JSON 回應：只回狀態碼
  }
  const code =
    body.error_code ?? (typeof body.code === "string" ? body.code : undefined);
  const message = body.msg ?? body.message ?? "";
  return {
    ok: false,
    taken: isEmailTakenError({ code, message }),
    error: `Auth 回應 ${res.status}${code ? `（${code}）` : ""}`,
  };
}
