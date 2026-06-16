// 全域內容 / 設定 資料存取 — SERVER ONLY（V2 新表 site_settings，key→jsonb）。
// 用於首頁 hero / 精選區塊、聯絡資訊等。value 形狀由呼叫端 narrow。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

/** 取得單一設定值（jsonb）。找不到回傳 null。 */
export const getSiteSetting = cache(
  unstable_cache(
    async <T = Record<string, unknown>>(key: string): Promise<T | null> => {
      const { data, error } = await getSupabaseClient()
        .from("site_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      throwOnError("getSiteSetting", error);
      return (data?.value as T | undefined) ?? null;
    },
    ["site-setting"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.siteSettings] },
  ),
);
