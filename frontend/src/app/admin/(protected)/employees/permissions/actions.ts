"use server";

// 權限管理 server actions（#261）。只有 hr 模組使用者可用：開頭一律 ensureHrAccess()；
// DB 端（RLS has_module('hr')、hr_* RPC、觸發器）另有相同檢查。錯誤回 { ok:false, error }，不 throw。
//
// 職位、職位權限、員工職位：以 hr 本人 session 寫入（RLS），稽核由 DB 觸發器寫入（admin_access_audit）。
//
// 建立員工帳號（單筆／批次）：
//   1. 以 hr session 讀員工：在職、有員工編號（且可作為 email）、尚未連結帳號。
//   2. service_role auth.admin.createUser({ email: <編號小寫>@airexpert.com.tw, password: 00000000, email_confirm: true })。
//      email 已存在 → 明確報錯，不覆蓋既有帳號（不改密碼、不連結）。
//   3. 以 hr session 呼叫 hr_link_staff_account（security definer）：同一交易內建立 admin_profiles
//      { role: 'staff', must_change_password: true }、連結 employees.admin_profile_id、寫稽核。
//      （employees.admin_profile_id 的觸發器只允許 hr／維運身分，service_role 不行，故必須以 hr 身分執行。）
//   4. 步驟 3 失敗 → 刪除步驟 2 的 auth 使用者回滾（admin_profiles 與連結在同一交易內，失敗時不會殘留）。
//
// 重設為預設密碼：先以 hr session 呼叫 hr_flag_staff_password_reset（設 must_change_password = true、寫稽核，
//   只限 staff 帳號），再以 service_role 把密碼改回 00000000。順序刻意如此：任何一步失敗時帳號都停在
//   「必須改密碼」的安全狀態，不會出現「預設密碼但已解鎖」。
// 停用／恢復登入：hr_log_staff_login（稽核、只限 staff 帳號）→ service_role 設定 ban_duration。
import { revalidatePath } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/admin/crud";
import {
  DEFAULT_STAFF_PASSWORD,
  isEmailTakenError,
  isPositionModule,
  staffEmailFor,
  staffRpcError,
  type PositionModule,
} from "@/lib/admin/staff-accounts";
import { ensureHrAccess } from "@/lib/employees/guard";
import { isEmployeeId } from "@/lib/employees/normalize";
import { isEmployeeCurrent, taipeiToday } from "@/lib/employees/status";

const PAGE = "/admin/employees/permissions";
const NOT_FOUND = "找不到此員工，請重新整理後再試。";
const POSITION_NOT_FOUND = "找不到此職位，請重新整理後再試。";
/** 停用登入的期間（Supabase Auth ban_duration；約 100 年 = 直到人事恢復）。 */
const BAN_FOREVER = "876000h";

const POSITION_NAME_MAX = 30;
const POSITION_DESCRIPTION_MAX = 200;

function revalidate() {
  revalidatePath(PAGE);
  revalidatePath("/admin/employees");
}

type DbError = { message?: string; code?: string; details?: string | null };

function positionWriteError(err: DbError | null | undefined): string {
  if (err?.code === "23505") return "已有同名的職位。";
  if (err?.code === "23503") {
    return "仍有員工使用此職位，無法刪除；請先改派其他職位，或改為停用。";
  }
  if (err?.code === "23514") {
    return `職位名稱必填且不超過 ${POSITION_NAME_MAX} 字，說明不超過 ${POSITION_DESCRIPTION_MAX} 字。`;
  }
  if (err?.code === "42501") return "沒有權限維護職位。";
  return staffRpcError(err, "儲存失敗。");
}

export interface PositionInput {
  name: string;
  description: string;
  sort_order?: number;
}

function normalizePosition(input: PositionInput):
  | {
      ok: true;
      row: { name: string; description: string | null; sort_order?: number };
    }
  | { ok: false; error: string } {
  const name = String(input?.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const description = String(input?.description ?? "").trim();
  if (!name) return { ok: false, error: "請輸入職位名稱。" };
  if (name.length > POSITION_NAME_MAX) {
    return { ok: false, error: `職位名稱不可超過 ${POSITION_NAME_MAX} 字。` };
  }
  if (description.length > POSITION_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `說明不可超過 ${POSITION_DESCRIPTION_MAX} 字。`,
    };
  }
  const row: { name: string; description: string | null; sort_order?: number } =
    { name, description: description || null };
  if (input.sort_order !== undefined) {
    const n = Math.trunc(Number(input.sort_order));
    if (!Number.isFinite(n) || Math.abs(n) > 1_000_000) {
      return { ok: false, error: "排序必須是整數。" };
    }
    row.sort_order = n;
  }
  return { ok: true, row };
}

// ── 職位 ────────────────────────────────────────────────────

export async function createPositionAction(
  input: PositionInput,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  const norm = normalizePosition(input);
  if (!norm.ok) return norm;
  const supabase = await getServerSupabase();
  const row = { ...norm.row };
  if (row.sort_order === undefined) {
    const { data: last } = await supabase
      .from("positions")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    row.sort_order =
      ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  }
  const { error } = await supabase.from("positions").insert(row);
  if (error) return { ok: false, error: positionWriteError(error) };
  revalidate();
  return { ok: true };
}

export async function updatePositionAction(
  id: string,
  input: PositionInput,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: POSITION_NOT_FOUND };
  const norm = normalizePosition(input);
  if (!norm.ok) return norm;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("positions")
    .update(norm.row)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: positionWriteError(error) };
  if (!data?.length) return { ok: false, error: POSITION_NOT_FOUND };
  revalidate();
  return { ok: true };
}

export async function setPositionActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: POSITION_NOT_FOUND };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("positions")
    .update({ active: active === true })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: positionWriteError(error) };
  if (!data?.length) return { ok: false, error: POSITION_NOT_FOUND };
  revalidate();
  return { ok: true };
}

export async function deletePositionAction(id: string): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: POSITION_NOT_FOUND };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("positions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: positionWriteError(error) };
  if (!data?.length) return { ok: false, error: POSITION_NOT_FOUND };
  revalidate();
  return { ok: true };
}

/** 設定職位的模組權限（整組覆寫：與目前比對後只新增／刪除差異，稽核只記實際變更）。 */
export async function setPositionModulesAction(
  id: string,
  modules: string[],
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: POSITION_NOT_FOUND };
  if (!Array.isArray(modules) || !modules.every(isPositionModule)) {
    // hr 等不可經職位授予的模組直接拒絕（DB check 約束另有相同限制）。
    return { ok: false, error: "包含不可經職位授予的權限。" };
  }
  const wanted = new Set<PositionModule>(modules);
  const supabase = await getServerSupabase();
  const { data: pos, error: posErr } = await supabase
    .from("positions")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (posErr) return { ok: false, error: positionWriteError(posErr) };
  if (!pos) return { ok: false, error: POSITION_NOT_FOUND };

  const { data: current, error: readErr } = await supabase
    .from("position_permissions")
    .select("module")
    .eq("position_id", id);
  if (readErr) return { ok: false, error: positionWriteError(readErr) };
  const have = new Set(
    ((current ?? []) as { module: string }[]).map((r) => r.module),
  );
  const toAdd = [...wanted].filter((m) => !have.has(m));
  const toRemove = [...have].filter((m) => !wanted.has(m as PositionModule));

  if (toRemove.length) {
    const { error } = await supabase
      .from("position_permissions")
      .delete()
      .eq("position_id", id)
      .in("module", toRemove);
    if (error) return { ok: false, error: positionWriteError(error) };
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from("position_permissions")
      .insert(toAdd.map((module) => ({ position_id: id, module })));
    if (error) return { ok: false, error: positionWriteError(error) };
  }
  revalidate();
  return { ok: true };
}

/** 指派員工職位（positionId = null → 不指派）。DB 觸發器只允許 hr，並寫稽核。 */
export async function assignEmployeePositionAction(
  employeeId: string,
  positionId: string | null,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  if (positionId !== null && !isEmployeeId(positionId)) {
    return { ok: false, error: POSITION_NOT_FOUND };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("employees")
    .update({ position_id: positionId })
    .eq("id", employeeId)
    .select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, error: POSITION_NOT_FOUND };
    return { ok: false, error: staffRpcError(error, "指派失敗。") };
  }
  if (!data?.length) return { ok: false, error: NOT_FOUND };
  revalidate();
  return { ok: true };
}

// ── 員工帳號 ────────────────────────────────────────────────

interface AccountEmployee {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  left_on: string | null;
  admin_profile_id: string | null;
}

const ACCOUNT_EMPLOYEE_COLUMNS =
  "id, code, name, active, left_on, admin_profile_id";

type Sb = Awaited<ReturnType<typeof getServerSupabase>>;

/** 檢查可否建立帳號；可以回 email，否則回錯誤訊息。 */
function accountEligibility(
  e: AccountEmployee,
  today: string,
): { ok: true; email: string } | { ok: false; error: string } {
  if (e.admin_profile_id) return { ok: false, error: "此員工已有帳號。" };
  if (!isEmployeeCurrent(e, today)) {
    return { ok: false, error: "只能替在職員工建立帳號。" };
  }
  const email = staffEmailFor(e.code);
  if (!email) {
    return {
      ok: false,
      error: e.code?.trim()
        ? "員工編號含不可用於 email 的字元（只能是英數與 . _ -），無法建立帳號。"
        : "此員工沒有員工編號，無法建立帳號。",
    };
  }
  return { ok: true, email };
}

/** 建立一位員工的帳號（呼叫端已確認 hr 權限）。失敗時刪除剛建立的 auth 使用者。 */
async function createAccountFor(
  supabase: Sb,
  e: AccountEmployee,
  today: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const eligible = accountEligibility(e, today);
  if (!eligible.ok) return eligible;
  const { email } = eligible;

  const admin = getAdminSupabase();
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password: DEFAULT_STAFF_PASSWORD,
      email_confirm: true,
    },
  );
  if (createErr || !created?.user) {
    if (isEmailTakenError(createErr)) {
      return {
        ok: false,
        error: `${email} 已有登入帳號，未建立也未覆蓋（密碼與權限皆未變更）。請洽管理員確認該帳號。`,
      };
    }
    return {
      ok: false,
      error: `建立登入帳號失敗：${createErr?.message ?? "未知錯誤"}`,
    };
  }

  const userId = created.user.id;
  const { error: linkErr } = await supabase.rpc("hr_link_staff_account", {
    p_employee_id: e.id,
    p_user_id: userId,
  });
  if (linkErr) {
    const { error: rollbackErr } = await admin.auth.admin.deleteUser(userId);
    const reason = staffRpcError(linkErr, "建立帳號失敗。");
    if (rollbackErr) {
      return {
        ok: false,
        error: `${reason}（回滾失敗：${email} 的登入帳號仍存在但沒有後台權限，請洽管理員刪除）`,
      };
    }
    return { ok: false, error: reason };
  }
  return { ok: true, email };
}

/** 建立單一員工的帳號（預設密碼 00000000，首次登入必須改密碼）。 */
export async function createStaffAccountAction(
  employeeId: string,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select(ACCOUNT_EMPLOYEE_COLUMNS)
    .eq("id", employeeId)
    .maybeSingle();
  if (error)
    return { ok: false, error: staffRpcError(error, "讀取員工失敗。") };
  if (!data) return { ok: false, error: NOT_FOUND };
  const res = await createAccountFor(
    supabase,
    data as AccountEmployee,
    taipeiToday(),
  );
  revalidate();
  return res.ok ? { ok: true } : res;
}

export type BatchCreateResult =
  | {
      ok: true;
      created: { name: string; email: string }[];
      failed: { name: string; error: string }[];
    }
  | { ok: false; error: string };

/** 批次建立：所有在職、有員工編號且尚無帳號的員工（逐一建立，一位失敗不影響其他人）。 */
export async function createStaffAccountsBatchAction(): Promise<BatchCreateResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select(ACCOUNT_EMPLOYEE_COLUMNS)
    .is("admin_profile_id", null)
    .eq("active", true)
    .order("code")
    .order("id");
  if (error)
    return { ok: false, error: staffRpcError(error, "讀取員工失敗。") };
  const today = taipeiToday();
  const targets = ((data ?? []) as AccountEmployee[]).filter((e) =>
    isEmployeeCurrent(e, today),
  );
  const created: { name: string; email: string }[] = [];
  const failed: { name: string; error: string }[] = [];
  // 逐一執行（不平行）：Auth admin API 有速率限制，且失敗訊息要能對應到每位員工。
  for (const e of targets) {
    const res = await createAccountFor(supabase, e, today);
    if (res.ok) created.push({ name: e.name, email: res.email });
    else failed.push({ name: e.name, error: res.error });
  }
  revalidate();
  return { ok: true, created, failed };
}

/** 重設為預設密碼（00000000），並要求下次登入改密碼。只限員工帳號（staff）。 */
export async function resetStaffPasswordAction(
  employeeId: string,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  const supabase = await getServerSupabase();
  const { data: userId, error } = await supabase.rpc(
    "hr_flag_staff_password_reset",
    { p_employee_id: employeeId },
  );
  if (error || typeof userId !== "string") {
    return { ok: false, error: staffRpcError(error, "重設密碼失敗。") };
  }
  const { error: updErr } = await getAdminSupabase().auth.admin.updateUserById(
    userId,
    { password: DEFAULT_STAFF_PASSWORD },
  );
  revalidate();
  if (updErr) {
    return {
      ok: false,
      error: `已要求此帳號下次登入改密碼，但密碼未能重設：${updErr.message}`,
    };
  }
  return { ok: true };
}

/** 停用（disabled = true）或恢復（false）員工帳號的登入。只限員工帳號（staff）。 */
export async function setStaffLoginDisabledAction(
  employeeId: string,
  disabled: boolean,
): Promise<ActionResult> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  const supabase = await getServerSupabase();
  const { data: userId, error } = await supabase.rpc("hr_log_staff_login", {
    p_employee_id: employeeId,
    p_disabled: disabled === true,
  });
  if (error || typeof userId !== "string") {
    return { ok: false, error: staffRpcError(error, "操作失敗。") };
  }
  const { error: updErr } = await getAdminSupabase().auth.admin.updateUserById(
    userId,
    { ban_duration: disabled === true ? BAN_FOREVER : "none" },
  );
  revalidate();
  if (updErr) return { ok: false, error: `操作失敗：${updErr.message}` };
  return { ok: true };
}
