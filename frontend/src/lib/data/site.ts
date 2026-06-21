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

// ---------- 品牌資產（LOGO / favicon） ----------
// 存於 site_settings.branding（is_public=true，公開 layout / Header 可讀）。
// value 形狀：{ logo_url?: string, favicon_url?: string }。兩者皆選填，
// 未設定時前台退回 repo 內建素材（見 BRANDING_DEFAULTS）。

/** site_settings 中品牌資產的 key。 */
export const BRANDING_KEY = "branding";

export interface Branding {
  /** Header / Footer 顯示的 LOGO 圖檔 URL。 */
  logo_url: string;
  /** 瀏覽器分頁 favicon 圖檔 URL。 */
  favicon_url: string;
}

/**
 * 內建 fallback：未在後台設定品牌資產時採用 repo 既有素材，
 * 確保前台 Header LOGO 與 favicon 永遠有可用來源。
 */
export const BRANDING_DEFAULTS: Branding = {
  logo_url: "/brand/logo-mark.png",
  favicon_url: "/favicon.ico",
};

/** 非空字串才採用，否則退回 fallback（避免存進空字串 / 非字串導致空 src）。 */
function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

/**
 * 取得品牌資產（LOGO / favicon）。任一欄位缺漏 / 為空 / 型別不符時，
 * 該欄位獨立退回 BRANDING_DEFAULTS，確保 Header 與 metadata icons 不會拿到空值。
 */
export async function getBranding(): Promise<Branding> {
  const value =
    await getSiteSetting<Partial<Record<keyof Branding, unknown>>>(
      BRANDING_KEY,
    );
  return {
    logo_url: strOr(value?.logo_url, BRANDING_DEFAULTS.logo_url),
    favicon_url: strOr(value?.favicon_url, BRANDING_DEFAULTS.favicon_url),
  };
}
