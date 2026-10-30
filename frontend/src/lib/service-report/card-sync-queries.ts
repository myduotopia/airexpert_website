// 詳情頁「保養卡同步」區塊的查詢（#280）— SERVER ONLY。
// 走登入者 session：service_report 對 mx_machines／mx_records 有 select policy（0021／0022），
// 對 mx_machine_columns 沒有（過濾卡欄名讀不到 → 預覽只說明對應規則）。
import "server-only";

import type { MxCardType } from "@/lib/admin/maintenance-normalize";
import type { ServiceType } from "@/lib/admin/maintenance-service-type";
import { getServerSupabase } from "@/lib/supabase-server";
import { srErrorMessage } from "./errors";
import type { SrResult } from "./types";

export interface SyncedCardRecord {
  id: string;
  service_date: string | null;
  hours: string | null;
  technician: string | null;
  service_type: ServiceType | null;
}

export interface CardSyncInfo {
  /** 報告單機台的卡別；機台不存在（或讀不到）為 null。 */
  card_type: MxCardType | null;
  /** 這張報告單已同步到保養卡的那一列（0041 source_service_report_id）；沒有為 null。 */
  synced: SyncedCardRecord | null;
}

export async function getCardSyncInfo(
  reportId: string,
  machineId: string | null,
): Promise<SrResult<CardSyncInfo>> {
  const supabase = await getServerSupabase();
  const [machine, record] = await Promise.all([
    machineId
      ? supabase
          .from("mx_machines")
          .select("card_type")
          .eq("id", machineId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("mx_records")
      .select("id, service_date, hours, technician, service_type")
      .eq("source_service_report_id", reportId)
      .maybeSingle(),
  ]);
  if (machine.error) return { ok: false, error: srErrorMessage(machine.error) };
  if (record.error) return { ok: false, error: srErrorMessage(record.error) };
  return {
    ok: true,
    data: {
      card_type:
        (machine.data as { card_type: MxCardType } | null)?.card_type ?? null,
      synced: (record.data as SyncedCardRecord | null) ?? null,
    },
  };
}
