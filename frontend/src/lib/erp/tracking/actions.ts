"use server";

// 週報追蹤資料（#272）server actions：交機進度／進廠維修／新機問題的新增、編輯、刪除，處理進度時間軸，
// 連結單據與機台的選項讀取。（CSV 由週報頁 server 端以 trackingCsvFile 產生，見 #271 ReportToolbar。）
// 每個 action 開頭 ensureErp()（layout 不保護 server action）；回傳 { ok, error }，不 throw。
// 寫入走登入者 session（RLS：has_module('erp')）；DB 觸發器的驗證錯誤以 erpErrorMessage 顯示 detail。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import { erpErrorMessage } from "@/lib/erp/errors";
import type { ErpResult } from "@/lib/erp/types";
import {
  isUuid,
  normalizeDeliveryInput,
  normalizeMachineIssueInput,
  normalizeProgressInput,
  normalizeRepairInput,
} from "./normalize";
import {
  listCustomerMachines,
  listDeliveryDocuments,
  listProgress,
  PROGRESS_PARENT_COLUMN,
} from "./queries";
import type {
  DeliveryDocumentOption,
  DeliveryJobInput,
  MachineIssueInput,
  MachineOption,
  ProgressEntry,
  ProgressInput,
  ProgressParent,
  RepairJobInput,
  TrackingKind,
} from "./types";

export type TrackingSaveResult<Input> =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: keyof Input };

const PATHS: Record<TrackingKind, string> = {
  delivery: "/admin/erp/meeting/delivery",
  repairs: "/admin/erp/meeting/repairs",
  "machine-issues": "/admin/erp/meeting/machine-issues",
};

const TABLES: Record<TrackingKind, string> = {
  delivery: "delivery_jobs",
  repairs: "repair_jobs",
  "machine-issues": "machine_issues",
};

const NOT_FOUND = "找不到此筆資料（可能已被刪除），請重新整理。";

async function insertRow(
  kind: TrackingKind,
  row: object,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from(TABLES[kind])
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidatePath(PATHS[kind]);
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

async function updateRow(
  kind: TrackingKind,
  id: string,
  row: object,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from(TABLES[kind])
      .update(row)
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
    revalidatePath(PATHS[kind]);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

async function deleteRow(
  kind: TrackingKind,
  id: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from(TABLES[kind])
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
    revalidatePath(PATHS[kind]);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "刪除失敗。" };
  }
}

// ── 交機進度 ─────────────────────────────────────────────────

export async function saveDeliveryJobAction(
  id: string | null,
  input: DeliveryJobInput,
): Promise<TrackingSaveResult<DeliveryJobInput>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeDeliveryInput(input);
  if (!norm.ok) return norm;
  return id
    ? updateRow("delivery", id, norm.row)
    : insertRow("delivery", norm.row);
}

export async function deleteDeliveryJobAction(
  id: string,
): Promise<ErpResult<null>> {
  return deleteRow("delivery", id);
}

export async function loadDeliveryDocumentsAction(
  customerId: string,
): Promise<
  ErpResult<{ documents: DeliveryDocumentOption[]; customerPrepaid: number }>
> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isUuid(customerId)) return { ok: false, error: "請先選擇客戶。" };
  try {
    return { ok: true, data: await listDeliveryDocuments(customerId) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "讀取單據失敗。" };
  }
}

// ── 進廠維修 ─────────────────────────────────────────────────

export async function saveRepairJobAction(
  id: string | null,
  input: RepairJobInput,
): Promise<TrackingSaveResult<RepairJobInput>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeRepairInput(input);
  if (!norm.ok) return norm;
  return id
    ? updateRow("repairs", id, norm.row)
    : insertRow("repairs", norm.row);
}

export async function deleteRepairJobAction(
  id: string,
): Promise<ErpResult<null>> {
  return deleteRow("repairs", id);
}

// ── 新機問題 ─────────────────────────────────────────────────

export async function saveMachineIssueAction(
  id: string | null,
  input: MachineIssueInput,
): Promise<TrackingSaveResult<MachineIssueInput>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeMachineIssueInput(input);
  if (!norm.ok) return norm;
  return id
    ? updateRow("machine-issues", id, norm.row)
    : insertRow("machine-issues", norm.row);
}

export async function deleteMachineIssueAction(
  id: string,
): Promise<ErpResult<null>> {
  return deleteRow("machine-issues", id);
}

export async function loadCustomerMachinesAction(
  customerId: string,
): Promise<ErpResult<MachineOption[]>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isUuid(customerId)) return { ok: false, error: "請先選擇客戶。" };
  try {
    return { ok: true, data: await listCustomerMachines(customerId) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "讀取機台失敗。" };
  }
}

// ── 處理進度 ─────────────────────────────────────────────────

const PARENT_KIND: Record<ProgressParent, TrackingKind> = {
  repair: "repairs",
  issue: "machine-issues",
};

function isParent(v: unknown): v is ProgressParent {
  return v === "repair" || v === "issue";
}

export async function listProgressAction(
  parent: ProgressParent,
  parentId: string,
): Promise<ErpResult<ProgressEntry[]>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isParent(parent) || !isUuid(parentId)) {
    return { ok: false, error: NOT_FOUND };
  }
  try {
    return { ok: true, data: await listProgress(parent, parentId) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "讀取進度失敗。" };
  }
}

export async function addProgressAction(
  parent: ProgressParent,
  parentId: string,
  input: ProgressInput,
): Promise<TrackingSaveResult<ProgressInput>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isParent(parent) || !isUuid(parentId)) {
    return { ok: false, error: NOT_FOUND };
  }
  const norm = normalizeProgressInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("tracking_progress")
      .insert({ ...norm.row, [PROGRESS_PARENT_COLUMN[parent]]: parentId })
      .select("id")
      .single();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidatePath(PATHS[PARENT_KIND[parent]]);
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function deleteProgressAction(
  parent: ProgressParent,
  id: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isParent(parent) || !isUuid(id)) return { ok: false, error: NOT_FOUND };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("tracking_progress")
      .delete()
      .eq("id", id)
      .not(PROGRESS_PARENT_COLUMN[parent], "is", null)
      .select("id");
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
    revalidatePath(PATHS[PARENT_KIND[parent]]);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "刪除失敗。" };
  }
}
