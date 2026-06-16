// 全域內容 / 設定 資料存取 — SERVER ONLY（V2 新表 site_settings，key→jsonb）。
// 用於首頁 hero / 精選區塊、聯絡資訊等。value 形狀由呼叫端 narrow。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

// 內部快取函式回傳 unknown —— 泛型若直接包進 cache()/unstable_cache() 會在包裝邊界
// 被實例化掉（callers 無法 narrow）。故以「具體 unknown 快取函式 + 薄泛型包裝」保留型別。
const getSiteSettingValue = cache(
  unstable_cache(
    async (key: string): Promise<unknown> => {
      const { data, error } = await getSupabaseClient()
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      throwOnError("getSiteSetting", error);
      return data?.value ?? null;
    },
    ["site-setting"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.siteSettings] },
  ),
);

/**
 * 取得單一設定值（jsonb）。找不到回傳 null。
 * value 形狀由呼叫端以泛型指定（回傳為 `unknown` 之 cast，呼叫端自負驗證責任）。
 */
export async function getSiteSetting<T = Record<string, unknown>>(
  key: string,
): Promise<T | null> {
  return (await getSiteSettingValue(key)) as T | null;
}
