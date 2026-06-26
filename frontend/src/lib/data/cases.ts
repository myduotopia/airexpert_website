// 節能實績 資料存取 — SERVER ONLY。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import { getServerSupabase } from "../supabase-server";
import type { Case } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

export const getPublishedCases = cache(
  unstable_cache(
    async (): Promise<Case[]> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      throwOnError("getPublishedCases", error);
      return (data ?? []) as Case[];
    },
    ["published-cases"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

export const getCasesByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Case[]> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      throwOnError("getCasesByCategory", error);
      return (data ?? []) as Case[];
    },
    ["cases-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

export const getCaseBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Case | null> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getCaseBySlug", error);
      return (data as Case | null) ?? null;
    },
    ["case-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

/**
 * 管理者預覽用：依 slug 取單一實績，「不限 status」（含隱藏 draft / archived）。
 * 走 getServerSupabase()（per-request、尊重 RLS、讀登入 session），且「不快取」
 * —— 預覽內容必須即時反映後台最新狀態，不可走 anon 公開快取。
 * 對 admin：RLS「admin all cases」放行任何 status；對 anon：RLS 僅回 published
 * （但本函式僅在確認為 admin 後才呼叫）。
 */
export const getCaseBySlugPreview = async (
  slug: string,
): Promise<Case | null> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  throwOnError("getCaseBySlugPreview", error);
  return (data as Case | null) ?? null;
};
