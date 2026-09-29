"use server";

// 開單自動帶入保養階段的 server actions（spec §6.2）。
// 與 actions.ts 相同規矩：開頭先 ensureServiceReport（layout 不保護 action），
// 錯誤一律回 { ok:false, error }（中文），不 throw 到 error boundary。

import { revalidatePath } from "next/cache";
import { SR_STALE_MESSAGE, srErrorMessage } from "@/lib/service-report/errors";
import { ensureServiceReport } from "@/lib/service-report/guard";
import {
  listStagesForMachine,
  type MachineStagesData,
} from "@/lib/service-report/plan/queries";
import type { ServiceReportStatus, SrResult } from "@/lib/service-report/types";
import { isUuid } from "@/lib/service-report/validate";
import { getServerSupabase } from "@/lib/supabase-server";

const BASE_PATH = "/admin/service-reports";

/** 可編輯的狀態（＝非作廢），與 actions.ts 的 saveReportAction 一致。 */
const EDITABLE_STATUSES: ServiceReportStatus[] = [
  "draft",
  "printed",
  "completed",
];

/**
 * 表單選了機台後，取該機台的方案 / 階段（含已開過、已達門檻旗標）。
 * 機台不存在或非空壓機卡回 data: null（表單就不顯示提示與下拉）。
 */
export async function listMachineStagesAction(
  machineId: string,
): Promise<SrResult<MachineStagesData | null>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(machineId)) return { ok: true, data: null };
  return listStagesForMachine(machineId);
}

/**
 * 清除報告單對應的階段（三個 plan_stage_* 欄位一併清空）。
 * 清除後該階段視為未開過，會重新出現在提醒與套用提示中。
 */
export async function clearReportStageAction(
  id: string,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: "報告單編號不正確" };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("sr_reports")
    .update({
      plan_stage_id: null,
      plan_stage_hours: null,
      plan_stage_label: null,
    })
    .eq("id", id)
    .in("status", EDITABLE_STATUSES)
    .select("id");
  if (error) return { ok: false, error: srErrorMessage(error) };
  const row = (data as { id: string }[] | null)?.[0];
  if (!row) return { ok: false, error: SR_STALE_MESSAGE };

  revalidatePath(BASE_PATH);
  revalidatePath(`${BASE_PATH}/${row.id}`);
  revalidatePath(`${BASE_PATH}/${row.id}/edit`);
  return { ok: true, data: { id: row.id } };
}
