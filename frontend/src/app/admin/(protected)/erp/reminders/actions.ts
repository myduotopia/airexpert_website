"use server";

// ERP 提醒事項 server actions（#274）。開頭一律 ensureErp()，錯誤回 { ok:false, error }。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/admin/auth";
import { ensureErp } from "@/lib/erp/guard";
import { erpErrorMessage } from "@/lib/erp/errors";
import {
  syncVendorReminders,
  type ReminderSyncSummary,
} from "@/lib/erp/queries/reminders";
import {
  normalizeHandleInput,
  normalizeRuleInput,
  type ReminderRuleInput,
  type RuleInputField,
} from "@/lib/erp/reminders/rule-input";
import { dueDatesBetween } from "@/lib/erp/reminders/schedule";

type Fail = { ok: false; error: string; field?: RuleInputField };

function revalidateReminders(vendorId?: string | null) {
  revalidatePath("/admin/erp/reminders");
  if (vendorId) revalidatePath(`/admin/erp/vendors/${vendorId}`);
  // 側欄徽章在 (protected) layout
  revalidatePath("/admin", "layout");
}

function fail(e: unknown, fallback: string): Fail {
  return { ok: false, error: (e as Error)?.message || fallback };
}

/** 新增（id 為 null，一律 manual）或編輯規則。auto 規則可改內容，但不可改對象或改成單次。 */
export async function saveReminderRuleAction(
  id: string | null,
  input: ReminderRuleInput,
): Promise<{ ok: true; id: string } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeRuleInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    if (!id) {
      const { data, error } = await supabase
        .from("erp_reminder_rules")
        .insert({ ...norm.row, source: "manual" })
        .select("id")
        .single();
      if (error) return { ok: false, error: erpErrorMessage(error) };
      revalidateReminders(norm.row.vendor_id);
      return { ok: true, id: (data as { id: string }).id };
    }

    const { data: cur, error: readErr } = await supabase
      .from("erp_reminder_rules")
      .select("id, source, vendor_id, auto_missing")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { ok: false, error: erpErrorMessage(readErr) };
    if (!cur) return { ok: false, error: "找不到這條規則（可能已被刪除）。" };
    const rule = cur as {
      source: "auto" | "manual";
      vendor_id: string | null;
      auto_missing: boolean;
    };
    let patch: Record<string, unknown> = { ...norm.row };
    if (rule.source === "auto") {
      if (norm.row.kind === "once") {
        return {
          ok: false,
          error: "由備註產生的規則不可改為單次；請另外新增手動規則。",
          field: "kind",
        };
      }
      // 對象固定為原廠商
      patch.vendor_id = rule.vendor_id;
      // 備註已不再出現（被同步停用）的 auto 規則，使用者重新啟用 → 轉為手動，之後同步不會再停用它
      if (rule.auto_missing && norm.row.active) {
        patch = {
          ...patch,
          source: "manual",
          auto_key: null,
          auto_missing: false,
        };
      }
    }
    const { error } = await supabase
      .from("erp_reminder_rules")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidateReminders((patch.vendor_id as string | null) ?? null);
    return { ok: true, id };
  } catch (e) {
    return fail(e, "儲存失敗。");
  }
}

export async function setReminderRuleActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: true } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const supabase = await getServerSupabase();
    const { data: cur, error: readErr } = await supabase
      .from("erp_reminder_rules")
      .select("source, vendor_id, auto_missing")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { ok: false, error: erpErrorMessage(readErr) };
    if (!cur) return { ok: false, error: "找不到這條規則（可能已被刪除）。" };
    const rule = cur as {
      source: string;
      vendor_id: string | null;
      auto_missing: boolean;
    };
    const patch: Record<string, unknown> =
      active && rule.source === "auto" && rule.auto_missing
        ? { active, source: "manual", auto_key: null, auto_missing: false }
        : { active };
    const { error } = await supabase
      .from("erp_reminder_rules")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidateReminders(rule.vendor_id);
    return { ok: true };
  } catch (e) {
    return fail(e, "更新失敗。");
  }
}

/** 只可刪除手動規則（auto 規則刪了下次同步會再建立，請改為停用）。處理紀錄一併刪除。 */
export async function deleteReminderRuleAction(
  id: string,
): Promise<{ ok: true } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("erp_reminder_rules")
      .delete()
      .eq("id", id)
      .eq("source", "manual")
      .select("id, vendor_id");
    if (error) return { ok: false, error: erpErrorMessage(error) };
    const rows = (data ?? []) as { vendor_id: string | null }[];
    if (rows.length === 0) {
      return {
        ok: false,
        error: "只能刪除手動規則；由備註產生的規則請改為停用。",
      };
    }
    revalidateReminders(rows[0].vendor_id);
    return { ok: true };
  } catch (e) {
    return fail(e, "刪除失敗。");
  }
}

/** 標記某次到期為完成／略過（可填備註）。同一次重複標記時以最後一次為準。 */
export async function handleReminderAction(input: {
  ruleId: string;
  dueDate: string;
  status: "done" | "skipped";
  note?: string | null;
}): Promise<{ ok: true } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeHandleInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data: rule, error: readErr } = await supabase
      .from("erp_reminder_rules")
      .select("kind, day_of_month, weekday, month, once_date, vendor_id")
      .eq("id", norm.row.rule_id)
      .maybeSingle();
    if (readErr) return { ok: false, error: erpErrorMessage(readErr) };
    if (!rule) return { ok: false, error: "找不到這條規則（可能已被刪除）。" };
    const r = rule as Parameters<typeof dueDatesBetween>[0] & {
      vendor_id: string | null;
    };
    // 到期日須是這條規則的其中一次到期（防止寫入任意日期）
    if (dueDatesBetween(r, norm.row.due_date, norm.row.due_date).length !== 1) {
      return { ok: false, error: "到期日與規則不符，請重新整理頁面。" };
    }
    // 重複標記時 upsert 走 update：handled_by 的 default（auth.uid()）不會套用 → 明確帶入目前處理人
    const user = await getSessionUser();
    const { error } = await supabase.from("erp_reminder_occurrences").upsert(
      {
        ...norm.row,
        ...(user?.id ? { handled_by: user.id } : {}),
        handled_at: new Date().toISOString(),
      },
      { onConflict: "rule_id,due_date" },
    );
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidateReminders(r.vendor_id);
    return { ok: true };
  } catch (e) {
    return fail(e, "儲存失敗。");
  }
}

/** 復原（刪除處理紀錄）：該次到期重新出現在清單。 */
export async function undoReminderAction(
  occurrenceId: string,
): Promise<{ ok: true } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("erp_reminder_occurrences")
      .delete()
      .eq("id", occurrenceId);
    if (error) return { ok: false, error: erpErrorMessage(error) };
    revalidateReminders();
    return { ok: true };
  } catch (e) {
    return fail(e, "復原失敗。");
  }
}

/** 重新同步單一廠商的 auto 規則（廠商詳情頁：存檔時同步失敗或尚未同步時的重試）。 */
export async function resyncVendorRemindersAction(
  vendorId: string,
): Promise<{ ok: true; summary: ReminderSyncSummary } | Fail> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!vendorId) return { ok: false, error: "缺少廠商。" };
  try {
    const summary = await syncVendorReminders(await getServerSupabase(), [
      vendorId,
    ]);
    revalidateReminders(vendorId);
    return { ok: true, summary };
  } catch (e) {
    return fail(e, "重新同步失敗。");
  }
}

/** 從全部廠商的備註重新解析（新增、更新、停用不再出現的 auto 規則；不動手動規則）。 */
export async function resyncAllVendorRemindersAction(): Promise<
  { ok: true; summary: ReminderSyncSummary } | Fail
> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const summary = await syncVendorReminders(await getServerSupabase(), "all");
    revalidateReminders();
    revalidatePath("/admin/erp/vendors", "layout");
    return { ok: true, summary };
  } catch (e) {
    return fail(e, "重新解析失敗。");
  }
}
