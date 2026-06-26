// 最新消息 資料存取 — SERVER ONLY。依 published_at 由新到舊。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import { getServerSupabase } from "../supabase-server";
import type { Article } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

export const getPublishedArticles = cache(
  unstable_cache(
    async (): Promise<Article[]> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("published_at", { ascending: false, nullsFirst: false });

      throwOnError("getPublishedArticles", error);
      return (data ?? []) as Article[];
    },
    ["published-articles"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

export const getArticlesByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Article[]> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("sort_order", { ascending: true })
        .order("published_at", { ascending: false, nullsFirst: false });

      throwOnError("getArticlesByCategory", error);
      return (data ?? []) as Article[];
    },
    ["articles-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

export const getArticleBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Article | null> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getArticleBySlug", error);
      return (data as Article | null) ?? null;
    },
    ["article-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

/**
 * 管理者預覽用：依 slug 取單一文章，「不限 status」（含隱藏 draft / archived）。
 * 走 getServerSupabase()（per-request、尊重 RLS、讀登入 session），且「不快取」
 * —— 預覽內容必須即時反映後台最新狀態，不可走 anon 公開快取。
 * 對 admin：RLS「admin all articles」放行任何 status；對 anon：RLS 僅回 published
 * （但本函式僅在確認為 admin 後才呼叫）。
 */
export const getArticleBySlugPreview = async (
  slug: string,
): Promise<Article | null> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  throwOnError("getArticleBySlugPreview", error);
  return (data as Article | null) ?? null;
};
