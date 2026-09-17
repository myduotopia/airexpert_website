"use server";

// 機台維護報告單 server actions（spec §4.3 / §4.4 / §7）。
// 每個 action 開頭先 ensureServiceReport（layout 不保護 action）；錯誤一律回 { ok:false, error }（中文），
// 不 throw 到 error boundary。狀態轉換一律以條件更新（.eq/.in("status", 前置狀態)）完成，避免併發覆蓋。
// 寫入走登入者 session（RLS has_module('service_report')）。

import { revalidatePath } from "next/cache";
import {
  SR_AUTO_NO_FAILED_MESSAGE,
  SR_NOT_FOUND_MESSAGE,
  SR_PRINTED_NO_LOCKED_MESSAGE,
  SR_STALE_MESSAGE,
  srErrorMessage,
} from "@/lib/service-report/errors";
import { ensureServiceReport } from "@/lib/service-report/guard";
import type {
  ServiceReportInput,
  ServiceReportStatus,
  SrResult,
} from "@/lib/service-report/types";
import {
  isUuid,
  isValidIsoDate,
  normalizeReportInput,
  validateReportInput,
  validateVoidReason,
} from "@/lib/service-report/validate";
import { getServerSupabase } from "@/lib/supabase-server";

const BASE_PATH = "/admin/service-reports";

/** 可編輯 / 可列印 / 可作廢的狀態（即「非作廢」）。 */
const EDITABLE_STATUSES: ServiceReportStatus[] = [
  "draft",
  "printed",
  "completed",
];

/** 自動取號撞號（有人手動輸入了下一個號碼）時重取的次數上限。 */
const AUTO_NO_ATTEMPTS = 3;

function revalidateReport(id?: string | null) {
  revalidatePath(BASE_PATH);
  if (id) {
    revalidatePath(`${BASE_PATH}/${id}`);
    revalidatePath(`${BASE_PATH}/print/${id}`);
  }
}

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;
type DbError = { code?: string; message?: string; details?: string | null };

async function rpcNextReportNo(
  supabase: Supabase,
  isoDate: string,
): Promise<SrResult<string>> {
  const { data, error } = await supabase.rpc("sr_next_report_no", {
    p_date: isoDate,
  });
  if (error) return { ok: false, error: srErrorMessage(error) };
  if (typeof data !== "string" || data === "") {
    return { ok: false, error: "取號失敗，請稍後再試" };
  }
  return { ok: true, data };
}

/** 取下一個派工單號（會佔用流水號）。 */
export async function nextReportNoAction(
  isoDate: string,
): Promise<SrResult<{ report_no: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isValidIsoDate(isoDate)) return { ok: false, error: "維護日期不正確" };
  const supabase = await getServerSupabase();
  const res = await rpcNextReportNo(supabase, isoDate);
  if (!res.ok) return res;
  return { ok: true, data: { report_no: res.data } };
}

/**
 * 儲存報告單。
 * - 新增（無 id）：單號空白則自動取號，狀態一律 draft；
 * - 編輯（有 id）：僅限 draft / printed / completed，不動狀態與列印紀錄。
 */
export async function saveReportAction(
  input: ServiceReportInput,
): Promise<SrResult<{ id: string; report_no: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  const invalid = validateReportInput(input);
  if (invalid) return { ok: false, error: invalid };

  const payload = normalizeReportInput(input);
  const supabase = await getServerSupabase();

  if (input.id) {
    // 已列印過的報告單不可改派工單號（紙本已帶出該號碼；DB 觸發器亦會擋）。
    // 先讀現況在 action 端擋下，給明確訊息且不送出更新；讀不到則交給下方條件更新判斷。
    // payload.report_no 已正規化；與 DB 觸發器相同以原值比較（is distinct from）。
    const current = await supabase
      .from("sr_reports")
      .select("report_no, print_count")
      .eq("id", input.id)
      .maybeSingle();
    if (current.error) {
      return { ok: false, error: srErrorMessage(current.error) };
    }
    const stored = current.data as {
      report_no: string;
      print_count: number;
    } | null;
    if (
      stored &&
      stored.print_count > 0 &&
      payload.report_no !== stored.report_no
    ) {
      return { ok: false, error: SR_PRINTED_NO_LOCKED_MESSAGE };
    }

    const { data, error } = await supabase
      .from("sr_reports")
      .update(payload)
      .eq("id", input.id)
      .in("status", EDITABLE_STATUSES)
      .select("id, report_no");
    if (error) return { ok: false, error: srErrorMessage(error) };
    const row = (data as { id: string; report_no: string }[] | null)?.[0];
    if (!row) return { ok: false, error: SR_STALE_MESSAGE };
    revalidateReport(row.id);
    return { ok: true, data: { id: row.id, report_no: row.report_no } };
  }

  const autoNo = payload.report_no === "";
  let lastError: DbError | null = null;
  for (let attempt = 0; attempt < (autoNo ? AUTO_NO_ATTEMPTS : 1); attempt++) {
    let reportNo = payload.report_no;
    if (autoNo) {
      const no = await rpcNextReportNo(supabase, payload.report_date);
      if (!no.ok) return no;
      reportNo = no.data;
    }
    const { data, error } = await supabase
      .from("sr_reports")
      .insert({ ...payload, report_no: reportNo, status: "draft" })
      .select("id, report_no")
      .single();
    if (!error) {
      const row = data as { id: string; report_no: string };
      revalidateReport(row.id);
      return { ok: true, data: { id: row.id, report_no: row.report_no } };
    }
    lastError = error;
    // 只有自動取號撞到手動輸入的號碼才重取；其他錯誤直接回報。
    if (!(autoNo && error.code === "23505")) break;
  }
  // 自動取號連續撞號用盡重試：不是使用者輸入的單號重複，給可行動的提示。
  if (autoNo && lastError?.code === "23505") {
    return { ok: false, error: SR_AUTO_NO_FAILED_MESSAGE };
  }
  return { ok: false, error: srErrorMessage(lastError) };
}

type PrintRow = {
  id: string;
  status: ServiceReportStatus;
  print_count: number;
  first_printed_at: string | null;
};

/**
 * 記錄一次列印：print_count+1、first_printed_at（首次）、last_printed_at；draft → printed。
 * 以讀到的 print_count / status 做條件更新避免併發遺失次數；0 列時重讀重試一次。
 */
export async function recordPrintAction(
  id: string,
): Promise<SrResult<{ print_count: number; status: ServiceReportStatus }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const supabase = await getServerSupabase();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: found, error: readError } = await supabase
      .from("sr_reports")
      .select("id, status, print_count, first_printed_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) return { ok: false, error: srErrorMessage(readError) };
    if (!found) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
    const row = found as PrintRow;
    if (row.status === "voided") {
      return { ok: false, error: "已作廢的報告單不可列印" };
    }

    const now = new Date().toISOString();
    const printCount = (row.print_count ?? 0) + 1;
    const status: ServiceReportStatus =
      row.status === "draft" ? "printed" : row.status;
    const { data, error } = await supabase
      .from("sr_reports")
      .update({
        print_count: printCount,
        first_printed_at: row.first_printed_at ?? now,
        last_printed_at: now,
        status,
      })
      .eq("id", id)
      .eq("status", row.status)
      .eq("print_count", row.print_count ?? 0)
      .select("id");
    if (error) return { ok: false, error: srErrorMessage(error) };
    if ((data as unknown[] | null)?.length) {
      revalidateReport(id);
      return { ok: true, data: { print_count: printCount, status } };
    }
  }
  return { ok: false, error: SR_STALE_MESSAGE };
}

/**
 * 狀態轉換共用：先讀狀態給明確的前置條件訊息，再以 .in("status", from) 條件更新。
 */
async function transition(
  id: string,
  from: ServiceReportStatus[],
  patch: Record<string, unknown>,
  wrongStateMessage: string,
): Promise<SrResult<{ id: string; status: ServiceReportStatus }>> {
  if (!isUuid(id)) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const supabase = await getServerSupabase();
  const { data: found, error: readError } = await supabase
    .from("sr_reports")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: srErrorMessage(readError) };
  if (!found) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const current = (found as { status: ServiceReportStatus }).status;
  if (!from.includes(current)) return { ok: false, error: wrongStateMessage };

  const { data, error } = await supabase
    .from("sr_reports")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (error) return { ok: false, error: srErrorMessage(error) };
  if (!(data as unknown[] | null)?.length) {
    return { ok: false, error: SR_STALE_MESSAGE };
  }
  revalidateReport(id);
  return {
    ok: true,
    data: { id, status: patch.status as ServiceReportStatus },
  };
}

/** 結案：printed → completed。 */
export async function completeReportAction(
  id: string,
): Promise<SrResult<{ id: string; status: ServiceReportStatus }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  return transition(
    id,
    ["printed"],
    { status: "completed", completed_at: new Date().toISOString() },
    "只有已列印的報告單可以結案",
  );
}

/** 重新開啟：completed → printed（清除結案時間）。 */
export async function reopenReportAction(
  id: string,
): Promise<SrResult<{ id: string; status: ServiceReportStatus }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  return transition(
    id,
    ["completed"],
    { status: "printed", completed_at: null },
    "只有已結案的報告單可以重新開啟",
  );
}

/** 作廢：draft / printed / completed → voided（需原因）；作廢後唯讀。 */
export async function voidReportAction(
  id: string,
  reason: string,
): Promise<SrResult<{ id: string; status: ServiceReportStatus }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  const invalid = validateVoidReason(reason);
  if (invalid) return { ok: false, error: invalid };
  return transition(
    id,
    EDITABLE_STATUSES,
    {
      status: "voided",
      voided_at: new Date().toISOString(),
      void_reason: reason.trim(),
    },
    "報告單已作廢",
  );
}

/** 刪除草稿：僅限 draft 且從未列印（其餘請改用作廢）。 */
export async function deleteDraftReportAction(
  id: string,
): Promise<SrResult<{ id: string }>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(id)) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const supabase = await getServerSupabase();
  const { data: found, error: readError } = await supabase
    .from("sr_reports")
    .select("id, status, print_count")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: srErrorMessage(readError) };
  if (!found) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const row = found as { status: ServiceReportStatus; print_count: number };
  if (row.status !== "draft" || (row.print_count ?? 0) > 0) {
    return {
      ok: false,
      error: "只有未列印過的草稿可以刪除，其他請改用作廢",
    };
  }

  const { data, error } = await supabase
    .from("sr_reports")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .eq("print_count", 0)
    .select("id");
  if (error) return { ok: false, error: srErrorMessage(error) };
  if (!(data as unknown[] | null)?.length) {
    return { ok: false, error: SR_STALE_MESSAGE };
  }
  revalidatePath(BASE_PATH);
  return { ok: true, data: { id } };
}
