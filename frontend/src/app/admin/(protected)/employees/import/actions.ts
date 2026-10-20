"use server";

// 員工匯入 server action（#257）。檔案只在瀏覽器解析，這裡只收「解析後的列」（不收檔案、不存 storage）。
//   1. ensureEmployeeAccess()（erp 或 service_report）。
//   2. 驗證資料格式；非 hr 使用者一律丟棄敏感欄位（client 端已丟棄，此為第二道防線）。
//   3. 以最新的既有員工重算寫入計畫（不信任 client 的預覽結果），依計畫新增／更新 employees（RLS 同 0027）。
//   4. hr 使用者：敏感欄位經 hr_import_employee_private（加密、內容相同不重寫）寫入。
// PostgREST 無跨請求交易：新增為單一批次（全成功或全失敗），更新逐筆；部分失敗時回報列號，可直接重跑
// （依員工編號／姓名比對，不會重複建檔）。
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hasModule } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureEmployeeAccess } from "@/lib/employees/guard";
import {
  buildImportPlan,
  planToOps,
  sanitizeImportRequest,
  stripPrivate,
  summarizePlan,
  toSheetKeys,
  type PlanSummary,
} from "@/lib/employees/import";
import { employeeWriteError } from "@/lib/employees/normalize";
import { hrRpcError } from "@/lib/employees/private";
import { listImportExisting } from "@/lib/employees/queries";
import { taipeiToday } from "@/lib/employees/status";

export interface ImportResult {
  ok: true;
  summary: PlanSummary;
  inserted: number;
  updated: number;
  /** 敏感資料：寫入的欄位數（null = 未寫入敏感資料）。 */
  privateFields: number | null;
  failures: { line: number; error: string }[];
  privateError: string | null;
}

export async function importEmployeesAction(
  raw: unknown,
): Promise<ImportResult | { ok: false; error: string }> {
  const denied = await ensureEmployeeAccess();
  if (denied) return denied;
  const req = sanitizeImportRequest(raw);
  if (!req) return { ok: false, error: "匯入資料格式不正確，請重新選擇檔案。" };
  if (req.rows.length === 0) return { ok: false, error: "沒有可匯入的資料。" };

  const isHr = await hasModule("hr");
  const rows = isHr ? req.rows : stripPrivate(req.rows);

  try {
    const existing = await listImportExisting();
    const plan = buildImportPlan(
      rows,
      existing,
      {
        status: req.status,
        compareKeys: toSheetKeys(req.compareKeys),
        canWritePrivate: isHr,
      },
      taipeiToday(),
    );
    const summary = summarizePlan(plan);
    const ops = planToOps(plan, randomUUID);
    const supabase = await getServerSupabase();
    const failures: ImportResult["failures"] = [];

    let inserted = 0;
    if (ops.inserts.length > 0) {
      const { error } = await supabase.from("employees").insert(ops.inserts);
      if (error) {
        return {
          ok: false,
          error: `新增員工失敗：${employeeWriteError(error)}`,
        };
      }
      inserted = ops.inserts.length;
    }

    let updated = 0;
    for (const u of ops.updates) {
      const { data, error } = await supabase
        .from("employees")
        .update(u.patch)
        .eq("id", u.id)
        .select("id");
      if (error) {
        failures.push({ line: u.line, error: employeeWriteError(error) });
      } else if (!data || (data as unknown[]).length === 0) {
        failures.push({ line: u.line, error: "找不到此員工（可能已被刪除）" });
      } else {
        updated += 1;
      }
    }

    let privateFields: number | null = null;
    let privateError: string | null = null;
    if (isHr && ops.private.length > 0) {
      // 更新失敗的列仍可寫敏感資料（員工本身存在）；新增已全部成功才會走到這裡。
      const { data, error } = await supabase.rpc("hr_import_employee_private", {
        p_rows: ops.private,
      });
      if (error) {
        privateError = hrRpcError(error);
      } else {
        privateFields = Number(
          (data as { written_fields?: number } | null)?.written_fields ?? 0,
        );
      }
    }

    revalidatePath("/admin/employees");
    return {
      ok: true,
      summary,
      inserted,
      updated,
      privateFields,
      failures,
      privateError,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "匯入失敗。" };
  }
}
