// 最新消息 資料存取 — SERVER ONLY。依 published_at 由新到舊。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
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
