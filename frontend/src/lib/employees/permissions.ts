// 權限管理頁（#261）查詢 — SERVER ONLY。只在 hr 模組守門後呼叫。
//   職位、職位權限、稽核：以 hr 本人 session 讀（RLS：has_module('hr')）。
//   帳號狀態（admin_profiles、Auth 的停用狀態）：service_role 讀（admin_profiles 的 RLS 只允許讀自己的列，
//   Auth 使用者只能用 admin API）。只回傳狀態，不回傳任何密碼相關資料。
import "server-only";

import { hasModule } from "@/lib/admin/auth";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getServerSupabase } from "@/lib/supabase-server";
import {
  isPositionModule,
  staffAccountStatus,
  staffEmailFor,
  type PositionModule,
  type StaffAccountStatus,
} from "@/lib/admin/staff-accounts";
import { isEmployeeCurrent, taipeiToday } from "./status";

export interface PositionRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  modules: PositionModule[];
  /** 指派到此職位的員工數（含離職）。 */
  employee_count: number;
}

export interface StaffPersonRow {
  employee_id: string;
  code: string | null;
  name: string;
  title: string | null;
  position_id: string | null;
  /** 實際在職（active 且未到離職日）。 */
  current: boolean;
  /** 預計的帳號 email（沒有編號或編號含不可用字元 → null，不能建立帳號）。 */
  expected_email: string | null;
  /** 已連結帳號的 email（未連結 → null）。 */
  account_email: string | null;
  status: StaffAccountStatus;
}

export interface AccessAuditRow {
  id: number;
  at: string;
  actor_email: string | null;
  actor_role: string;
  action: string;
  employee_id: string | null;
  detail: Record<string, unknown>;
}

export async function listPositions(): Promise<PositionRow[]> {
  const supabase = await getServerSupabase();
  const [positions, perms, emps] = await Promise.all([
    supabase
      .from("positions")
      .select("id, name, description, sort_order, active")
      .order("sort_order")
      .order("name"),
    supabase.from("position_permissions").select("position_id, module"),
    fetchAllRows<{ id: string; position_id: string | null }>((from, to) =>
      supabase
        .from("employees")
        .select("id, position_id")
        .not("position_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (positions.error) {
    throw new Error(`讀取職位失敗：${positions.error.message}`);
  }
  if (perms.error) throw new Error(`讀取職位權限失敗：${perms.error.message}`);
  if (emps.error) throw new Error(`讀取員工失敗：${emps.error.message}`);

  const modulesBy = new Map<string, PositionModule[]>();
  for (const p of (perms.data ?? []) as {
    position_id: string;
    module: string;
  }[]) {
    if (!isPositionModule(p.module)) continue;
    modulesBy.set(p.position_id, [
      ...(modulesBy.get(p.position_id) ?? []),
      p.module,
    ]);
  }
  const countBy = new Map<string, number>();
  for (const e of emps.data) {
    if (e.position_id) {
      countBy.set(e.position_id, (countBy.get(e.position_id) ?? 0) + 1);
    }
  }
  return (
    (positions.data ?? []) as Omit<PositionRow, "modules" | "employee_count">[]
  ).map((p) => ({
    ...p,
    modules: modulesBy.get(p.id) ?? [],
    employee_count: countBy.get(p.id) ?? 0,
  }));
}

interface EmployeeAccountFields {
  id: string;
  code: string | null;
  name: string;
  title: string | null;
  active: boolean;
  left_on: string | null;
  position_id: string | null;
  admin_profile_id: string | null;
}

/** 連結帳號的狀態（service_role）：admin_profiles 的 role／must_change_password + Auth 的 banned_until。 */
async function loadAccounts(ids: string[]): Promise<
  Map<
    string,
    {
      email: string | null;
      role: string | null;
      must_change_password: boolean;
      banned_until: string | null;
    }
  >
> {
  const out = new Map<
    string,
    {
      email: string | null;
      role: string | null;
      must_change_password: boolean;
      banned_until: string | null;
    }
  >();
  if (ids.length === 0) return out;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("admin_profiles")
    .select("id, email, role, must_change_password")
    .in("id", ids);
  if (error) throw new Error(`讀取帳號狀態失敗：${error.message}`);
  for (const p of (data ?? []) as {
    id: string;
    email: string | null;
    role: string | null;
    must_change_password: boolean | null;
  }[]) {
    out.set(p.id, {
      email: p.email,
      role: p.role,
      must_change_password: p.must_change_password === true,
      banned_until: null,
    });
  }
  // 停用登入狀態只存在 Auth：逐一讀取（員工帳號數量少；失敗時視為未停用並照常顯示）。
  await Promise.all(
    ids.map(async (id) => {
      const { data: u } = await admin.auth.admin.getUserById(id);
      const row = out.get(id);
      const banned = (u?.user as { banned_until?: string | null } | undefined)
        ?.banned_until;
      if (row && banned) row.banned_until = banned;
    }),
  );
  return out;
}

/** 人員頁籤：員工（預設只列在職）+ 帳號狀態。 */
export async function listStaffPeople(
  opts: { includeFormer?: boolean } = {},
): Promise<StaffPersonRow[]> {
  // 縱深防禦：下方以 service_role 讀帳號狀態（email、角色），不依賴呼叫端頁面的 requireModule('hr')。
  if (!(await hasModule("hr"))) throw new Error("沒有人事（hr）權限。");
  const supabase = await getServerSupabase();
  const { data, error } = await fetchAllRows<EmployeeAccountFields>(
    (from, to) =>
      supabase
        .from("employees")
        .select(
          "id, code, name, title, active, left_on, position_id, admin_profile_id",
        )
        .order("code", { nullsFirst: false })
        .order("name")
        .order("id")
        .range(from, to),
  );
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  const today = taipeiToday();
  const rows = data.filter(
    (e) => opts.includeFormer || isEmployeeCurrent(e, today),
  );
  const accounts = await loadAccounts(
    rows.map((e) => e.admin_profile_id).filter((v): v is string => !!v),
  );
  return rows.map((e) => {
    const acc = e.admin_profile_id ? accounts.get(e.admin_profile_id) : null;
    return {
      employee_id: e.id,
      code: e.code,
      name: e.name,
      title: e.title,
      position_id: e.position_id,
      current: isEmployeeCurrent(e, today),
      expected_email: staffEmailFor(e.code),
      account_email: acc?.email ?? null,
      status: staffAccountStatus({
        linked: !!e.admin_profile_id,
        role: acc?.role ?? null,
        mustChangePassword: acc?.must_change_password ?? false,
        bannedUntil: acc?.banned_until ?? null,
      }),
    };
  });
}

/** 最近的稽核紀錄（hr session；RLS 只給 hr）。 */
export async function listAccessAudit(limit = 100): Promise<AccessAuditRow[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("admin_access_audit")
    .select("id, at, actor_email, actor_role, action, employee_id, detail")
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`讀取稽核紀錄失敗：${error.message}`);
  return (data ?? []) as AccessAuditRow[];
}
