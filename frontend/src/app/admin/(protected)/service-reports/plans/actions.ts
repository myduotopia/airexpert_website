"use server";

// 保養方案 server actions（spec §4 / §7）。
// 每個 action 開頭先 ensureServiceReport（layout 不保護 action）；錯誤一律回 { ok:false, error }（中文）。
// 寫入走登入者 session（RLS has_module('service_report')）；
// 23505 依違反的 unique index 分辨「方案名稱已存在」/「同一方案的階段時數不可重複」。

import { revalidatePath } from "next/cache";
import {
  SP_PLAN_NOT_FOUND_MESSAGE,
  SP_STAGE_NOT_FOUND_MESSAGE,
  planErrorMessage,
} from "@/lib/service-report/plan/errors";
import type {
  ServicePlanInput,
  ServicePlanStageInput,
} from "@/lib/service-report/plan/types";
import {
  normalizePlanInput,
  normalizeStageInput,
  validatePlanInput,
  validateStageInput,
} from "@/lib/service-report/plan/validate";
import { ensureServiceReport } from "@/lib/service-report/guard";
import type { SrResult } from "@/lib/service-report/types";
import { isUuid } from "@/lib/service-report/validate";
import { getServerSupabase } from "@/lib/supabase-server";

const BASE_PATH = "/admin/service-reports";
const PLANS_PATH = `${BASE_PATH}/plans`;
const MACHINES_PATH = `${PLANS_PATH}/machines`;

/** 方案 / 階段 / 指定異動都會影響：方案頁、機台對應頁與列表頁提醒區塊。 */
function revalidatePlans(planId?: string | null) {
  revalidatePath(PLANS_PATH);
  if (planId) revalidatePath(`${PLANS_PATH}/${planId}`);
  revalidatePath(MACHINES_PATH);
  revalidatePath(BASE_PATH);
}

/** 新增 / 編輯保養方案。 */
export async function savePlanAction(
  input: ServicePlanInput,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  const invalid = validatePlanInput(input);
  if (invalid) return { ok: false, error: invalid };

  const payload = normalizePlanInput(input);
  const supabase = await getServerSupabase();

  if (input.id) {
    const { data, error } = await supabase
      .from("sr_service_plans")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id");
    if (error) return { ok: false, error: planErrorMessage(error) };
    const row = (data as { id: string }[] | null)?.[0];
    if (!row) return { ok: false, error: SP_PLAN_NOT_FOUND_MESSAGE };
    revalidatePlans(row.id);
    return { ok: true, data: { id: row.id } };
  }

  const { data, error } = await supabase
    .from("sr_service_plans")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: planErrorMessage(error) };
  const row = data as { id: string } | null;
  if (!row) return { ok: false, error: SP_PLAN_NOT_FOUND_MESSAGE };
  revalidatePlans(row.id);
  return { ok: true, data: { id: row.id } };
}

/** 刪除保養方案（階段連動刪除；已開單的報告單保留階段快照）。 */
export async function deletePlanAction(
  id: string,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: SP_PLAN_NOT_FOUND_MESSAGE };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("sr_service_plans")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: planErrorMessage(error) };
  if (!(data as unknown[] | null)?.length) {
    return { ok: false, error: SP_PLAN_NOT_FOUND_MESSAGE };
  }
  revalidatePlans(id);
  return { ok: true, data: { id } };
}

/** 新增 / 編輯階段（時數、名稱、料件）。 */
export async function saveStageAction(
  input: ServicePlanStageInput,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  const invalid = validateStageInput(input);
  if (invalid) return { ok: false, error: invalid };

  const payload = normalizeStageInput(input);
  const supabase = await getServerSupabase();

  if (input.id) {
    const { data, error } = await supabase
      .from("sr_service_plan_stages")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id");
    if (error) return { ok: false, error: planErrorMessage(error) };
    const row = (data as { id: string }[] | null)?.[0];
    if (!row) return { ok: false, error: SP_STAGE_NOT_FOUND_MESSAGE };
    revalidatePlans(payload.plan_id);
    return { ok: true, data: { id: row.id } };
  }

  const { data, error } = await supabase
    .from("sr_service_plan_stages")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: planErrorMessage(error) };
  const row = data as { id: string } | null;
  if (!row) return { ok: false, error: SP_STAGE_NOT_FOUND_MESSAGE };
  revalidatePlans(payload.plan_id);
  return { ok: true, data: { id: row.id } };
}

/** 刪除階段（已開單的報告單 plan_stage_id 轉 null，快照欄位仍在）。 */
export async function deleteStageAction(
  id: string,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: SP_STAGE_NOT_FOUND_MESSAGE };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("sr_service_plan_stages")
    .delete()
    .eq("id", id)
    .select("id, plan_id");
  if (error) return { ok: false, error: planErrorMessage(error) };
  const row = (data as { id: string; plan_id: string }[] | null)?.[0];
  if (!row) return { ok: false, error: SP_STAGE_NOT_FOUND_MESSAGE };
  revalidatePlans(row.plan_id);
  return { ok: true, data: { id: row.id } };
}

/** 逐台指定方案；planId 傳 null＝清除指定（改回依馬力比對）。 */
export async function setMachinePlanAction(
  machineId: string,
  planId: string | null,
): Promise<SrResult<{ machine_id: string; plan_id: string | null }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(machineId)) return { ok: false, error: "找不到機台" };
  if (planId !== null && !isUuid(planId)) {
    return { ok: false, error: SP_PLAN_NOT_FOUND_MESSAGE };
  }
  const supabase = await getServerSupabase();

  if (planId === null) {
    const { error } = await supabase
      .from("sr_machine_plans")
      .delete()
      .eq("machine_id", machineId);
    if (error) return { ok: false, error: planErrorMessage(error) };
    revalidatePlans(null);
    return { ok: true, data: { machine_id: machineId, plan_id: null } };
  }

  const { error } = await supabase.from("sr_machine_plans").upsert(
    {
      machine_id: machineId,
      plan_id: planId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "machine_id" },
  );
  if (error) return { ok: false, error: planErrorMessage(error) };
  revalidatePlans(planId);
  return { ok: true, data: { machine_id: machineId, plan_id: planId } };
}
