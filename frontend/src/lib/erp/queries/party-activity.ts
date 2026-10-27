// 客戶／廠商「相關單據」查詢（#267）— SERVER ONLY。
// 呼叫 DB RPC erp_party_activity（0036，security invoker：沿用登入者的 erp RLS），
// 單據與收付款在 DB 端 union all 後新到舊排序、limit／offset 分頁，只讀本頁 20 筆與總筆數。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "../errors";
import { ensureErp } from "../guard";
import {
  activityDocTypes,
  normalizeActivityResult,
  PARTY_ACTIVITY_PAGE_SIZE,
  type PartyActivityParams,
  type PartyActivityResult,
} from "../party-activity";
import type { ErpResult, PartyType } from "../types";

export async function listPartyActivity(
  partyType: PartyType,
  partyId: string,
  params: PartyActivityParams,
): Promise<ErpResult<PartyActivityResult>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("erp_party_activity", {
    p_party_type: partyType,
    p_party_id: partyId,
    p_doc_types: activityDocTypes(partyType, params.filter),
    p_include_voided: params.includeVoided,
    p_limit: PARTY_ACTIVITY_PAGE_SIZE,
    p_offset: (Math.max(1, params.page) - 1) * PARTY_ACTIVITY_PAGE_SIZE,
  });
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return { ok: true, data: normalizeActivityResult(data) };
}
