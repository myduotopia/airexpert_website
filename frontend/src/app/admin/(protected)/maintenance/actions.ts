"use server";

// 保養卡 server actions（office only）。讀寫走登入者 session，靠 mx_* 的 office RLS 擋。
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ActionResult } from "@/lib/admin/crud";
import {
  machinePayloadFromForm,
  recordPayloadFromForm,
  parseExtraction,
  type ExtractedDraft,
  type RecordPayload,
} from "@/lib/admin/maintenance-normalize";
import { extractMaintenanceCard } from "@/lib/ai/gemini";
import { findMachineBySerial } from "@/lib/admin/maintenance";

/**
 * 找或建客戶。優先以「客戶編號 code」比對（不分大小寫）；無編號時退回以 name 完全比對。
 * 回傳 customer id。
 */
async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  input: { code?: string | null; name?: string | null },
): Promise<string> {
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (code) {
    const { data: byCode } = await supabase
      .from("mx_customers")
      .select("id")
      .ilike("code", code)
      .limit(1)
      .maybeSingle();
    if (byCode) return (byCode as { id: string }).id;
    const { data: created, error } = await supabase
      .from("mx_customers")
      .insert({ code, name: name || "（未命名客戶）" })
      .select("id")
      .single();
    if (error) throw new Error(`建立客戶失敗：${error.message}`);
    return (created as { id: string }).id;
  }
  // 無客戶編號 → 沿用以名稱找/建。
  const clean = name;
  if (!clean) throw new Error("客戶名稱為必填。");
  const { data: existing } = await supabase
    .from("mx_customers")
    .select("id")
    .eq("name", clean)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from("mx_customers")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) throw new Error(`建立客戶失敗：${error.message}`);
  return (created as { id: string }).id;
}

/** 依客戶編號查客戶名稱（供表單自動帶入）。查不到回 null。 */
export async function lookupCustomerByCodeAction(
  code: string,
): Promise<{ name: string } | null> {
  await requireRole(["office"]);
  const clean = code.trim();
  if (!clean) return null;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("mx_customers")
    .select("name")
    .ilike("code", clean)
    .limit(1)
    .maybeSingle();
  return data ? { name: (data as { name: string }).name } : null;
}

/** 建立新卡（含客戶）。表單需帶 customer_name + 機器欄位。成功後導向卡詳情。 */
export async function createMachineAction(fd: FormData): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  if (!customerName) throw new Error("客戶名稱為必填。");
  const customerCode = String(fd.get("customer_code") ?? "").trim();
  const payload = machinePayloadFromForm(fd);

  const customerId = await findOrCreateCustomer(supabase, {
    code: customerCode,
    name: customerName,
  });
  const { data, error } = await supabase
    .from("mx_machines")
    .insert({ ...payload, customer_id: customerId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error("此機號已存在，請改用既有卡片。");
    throw new Error(`建立保養卡失敗：${error.message}`);
  }
  revalidatePath("/admin/maintenance");
  redirect(`/admin/maintenance/${(data as { id: string }).id}`);
}

/** 更新既有卡的基本資訊（含客戶名）。 */
export async function updateMachineAction(
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  const customerCode = String(fd.get("customer_code") ?? "").trim();
  try {
    const payload = machinePayloadFromForm(fd);
    const patch: Record<string, unknown> = { ...payload };
    if (customerName || customerCode) {
      patch.customer_id = await findOrCreateCustomer(supabase, {
        code: customerCode,
        name: customerName,
      });
    }
    const { error } = await supabase
      .from("mx_machines")
      .update(patch)
      .eq("id", machineId);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "此機號已存在。" };
      return { ok: false, error: error.message };
    }
    revalidatePath(`/admin/maintenance/${machineId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 新增一列維護紀錄（手動；source='manual'）。 */
export async function addRecordAction(
  machineId: string,
  fd: FormData,
): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const payload = recordPayloadFromForm(fd);
  const { error } = await supabase
    .from("mx_records")
    .insert({ ...payload, machine_id: machineId, source: "manual" });
  if (error) throw new Error(`新增維護紀錄失敗：${error.message}`);
  revalidatePath(`/admin/maintenance/${machineId}`);
  redirect(`/admin/maintenance/${machineId}`);
}

/** 更新一列維護紀錄。 */
export async function updateRecordAction(
  recordId: string,
  machineId: string,
  fd: FormData,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const payload = recordPayloadFromForm(fd);
  const { error } = await supabase
    .from("mx_records")
    .update(payload)
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/maintenance/${machineId}`);
  return { ok: true };
}

/** 刪除一列維護紀錄（DeleteButton 以 bind 帶入 id）。 */
export async function deleteRecordAction(
  recordId: string,
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_records")
    .delete()
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/maintenance/${machineId}`);
  return { ok: true };
}

export type ExtractResult =
  | {
      ok: true;
      draft: ExtractedDraft;
      match: { id: string; serial_no: string; customer_name: string } | null;
      draftId: string;
    }
  | { ok: false; error: string };

/** 拍照辨識：Gemini 擷取 → 稽核草稿 → 機號比對。photoPath 為已存 Storage 的原圖 path。 */
export async function extractCardFromImageAction(input: {
  imageBase64: string;
  mimeType: string;
  photoPath: string;
}): Promise<ExtractResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    const { raw } = await extractMaintenanceCard(
      input.imageBase64,
      input.mimeType,
    );
    const draft = parseExtraction(raw);

    const { data: user } = await supabase.auth.getUser();
    const { data: draftRow } = await supabase
      .from("mx_import_drafts")
      .insert({
        created_by: user.user?.id ?? null,
        photo_path: input.photoPath,
        raw_output: raw,
        status: "pending",
      })
      .select("id")
      .single();

    const match = await findMachineBySerial(draft.basic.serial_no);
    return {
      ok: true,
      draft,
      match,
      draftId: (draftRow as { id: string } | null)?.id ?? "",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface CommitImportInput {
  draftId: string;
  machineId: string | null; // 命中既有卡則帶 id；否則 null → 依 basic 建卡
  basic: {
    customer_name: string;
    customer_code: string;
    serial_no: string;
    machine_no: string;
    location: string;
    purchased_at: string;
    model: string;
    horsepower: string;
    voltage: string;
  };
  records: RecordPayload[];
}

export async function commitImportAction(
  input: CommitImportInput,
): Promise<ActionResult & { machineId?: string }> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  try {
    let machineId = input.machineId;
    // 記錄本次是否「新建」卡：若接著寫維護列失敗，需回滾刪卡避免孤兒卡
    // （commitImportAction 非單一 DB 交易，故手動補償）。
    let createdMachineId: string | null = null;

    if (!machineId) {
      const serial = input.basic.serial_no.trim();
      if (!serial) return { ok: false, error: "機號為必填。" };
      const customerId = await findOrCreateCustomer(supabase, {
        code: input.basic.customer_code,
        name: input.basic.customer_name || "（未命名客戶）",
      });
      const { data: machine, error: mErr } = await supabase
        .from("mx_machines")
        .insert({
          customer_id: customerId,
          serial_no: serial,
          machine_no: input.basic.machine_no || null,
          location: input.basic.location || null,
          purchased_at: input.basic.purchased_at || null,
          model: input.basic.model || null,
          horsepower: input.basic.horsepower || null,
          voltage: input.basic.voltage || null,
        })
        .select("id")
        .single();
      if (mErr) {
        if (mErr.code === "23505")
          return { ok: false, error: "此機號已存在，請改為附加到現有卡。" };
        return { ok: false, error: mErr.message };
      }
      machineId = (machine as { id: string }).id;
      createdMachineId = machineId;
    }

    if (input.records.length > 0) {
      const { error: rErr } = await supabase.from("mx_records").insert(
        input.records.map((r) => ({
          ...r,
          machine_id: machineId,
          source: "photo" as const,
        })),
      );
      if (rErr) {
        // 回滾：本次新建的卡若寫維護列失敗 → 刪卡，避免留下空的孤兒卡。
        // 附加到既有卡（createdMachineId 為 null）時不刪，維持既有資料。
        if (createdMachineId) {
          await supabase
            .from("mx_machines")
            .delete()
            .eq("id", createdMachineId);
        }
        return { ok: false, error: `匯入維護紀錄失敗：${rErr.message}` };
      }
    }

    // draftId 可能為空（辨識時稽核草稿寫入失敗，best-effort）；為空則跳過更新，
    // 避免 .eq("id","") 靜默匹配不到任何列。
    if (input.draftId) {
      await supabase
        .from("mx_import_drafts")
        .update({ status: "committed", machine_id: machineId })
        .eq("id", input.draftId);
    }

    revalidatePath("/admin/maintenance");
    return { ok: true, machineId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 封存（軟刪除）一張卡：從正常列表移到封存區。DeleteButton 以 bind 帶入 id。 */
export async function archiveMachineAction(
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", machineId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/maintenance/archive");
  return { ok: true };
}

/** 從封存區復原一張卡（form action）。 */
export async function restoreMachineAction(machineId: string): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .update({ archived_at: null })
    .eq("id", machineId);
  if (error) {
    // 邊界：封存後又用同機號建了新的使用中卡片，復原會撞部分唯一索引（23505）。
    if (error.code === "23505") {
      throw new Error(
        "同機號已有使用中的卡片，無法復原。請先處理該卡，或改為永久刪除此封存卡。",
      );
    }
    throw new Error(`復原失敗：${error.message}`);
  }
  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/maintenance/archive");
}

/** 永久刪除一張卡（連同維護紀錄，FK cascade）。DeleteButton 以 bind 帶入 id。 */
export async function deleteMachinePermanentlyAction(
  machineId: string,
): Promise<ActionResult> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("mx_machines")
    .delete()
    .eq("id", machineId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/maintenance/archive");
  return { ok: true };
}
