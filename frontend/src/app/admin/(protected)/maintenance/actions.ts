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

/** 找或建客戶（依 name 完全比對；不強制唯一）。回傳 customer id。 */
async function findOrCreateCustomer(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  name: string,
): Promise<string> {
  const clean = name.trim();
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

/** 建立新卡（含客戶）。表單需帶 customer_name + 機器欄位。成功後導向卡詳情。 */
export async function createMachineAction(fd: FormData): Promise<void> {
  await requireRole(["office"]);
  const supabase = await getServerSupabase();

  const customerName = String(fd.get("customer_name") ?? "").trim();
  if (!customerName) throw new Error("客戶名稱為必填。");
  const payload = machinePayloadFromForm(fd);

  const customerId = await findOrCreateCustomer(supabase, customerName);
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
  try {
    const payload = machinePayloadFromForm(fd);
    const patch: Record<string, unknown> = { ...payload };
    if (customerName) {
      patch.customer_id = await findOrCreateCustomer(supabase, customerName);
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
    serial_no: string;
    card_no: string;
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

    if (!machineId) {
      const serial = input.basic.serial_no.trim();
      if (!serial) return { ok: false, error: "機號為必填。" };
      const customerId = await findOrCreateCustomer(
        supabase,
        input.basic.customer_name || "（未命名客戶）",
      );
      const { data: machine, error: mErr } = await supabase
        .from("mx_machines")
        .insert({
          customer_id: customerId,
          serial_no: serial,
          card_no: input.basic.card_no || null,
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
    }

    if (input.records.length > 0) {
      const { error: rErr } = await supabase.from("mx_records").insert(
        input.records.map((r) => ({
          ...r,
          machine_id: machineId,
          source: "photo" as const,
        })),
      );
      if (rErr)
        return { ok: false, error: `匯入維護紀錄失敗：${rErr.message}` };
    }

    await supabase
      .from("mx_import_drafts")
      .update({ status: "committed", machine_id: machineId })
      .eq("id", input.draftId);

    revalidatePath("/admin/maintenance");
    return { ok: true, machineId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
