// ERP 週報查詢 — SERVER ONLY。以登入者 session 呼叫 RPC（DB 端檢查 has_module('erp')）。
import "server-only";

import { erpErrorMessage } from "@/lib/erp/errors";
import type { ErpResult } from "@/lib/erp/types";
import { getServerSupabase } from "@/lib/supabase-server";
import type { MaintenanceSourceRow } from "./maintenance";

/**
 * 維護完成紀錄：區間內已結案、未作廢的維護報告單（0037 erp_meeting_maintenance）。
 * sr_reports 本身沒有 erp 的 RLS policy（含客戶聯絡資料），故經由 security definer RPC
 * 只取報表需要的欄位。依日期、派工單號排序。
 */
export async function listMaintenanceRecords(range: {
  from: string;
  to: string;
}): Promise<ErpResult<MaintenanceSourceRow[]>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("erp_meeting_maintenance", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return { ok: true, data: (data ?? []) as MaintenanceSourceRow[] };
}
