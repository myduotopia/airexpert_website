// 商品介紹 資料存取 — SERVER ONLY。anon 受 RLS 保護，只讀 status='published'。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import { getServerSupabase } from "../supabase-server";
import type { Product } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

export const getPublishedProducts = cache(
  unstable_cache(
    async (): Promise<Product[]> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      throwOnError("getPublishedProducts", error);
      return (data ?? []) as Product[];
    },
    ["published-products"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

export const getProductsByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Product[]> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("sort_order", { ascending: true });

      throwOnError("getProductsByCategory", error);
      return (data ?? []) as Product[];
    },
    ["products-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

export const getProductBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Product | null> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getProductBySlug", error);
      return (data as Product | null) ?? null;
    },
    ["product-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

/**
 * 管理者預覽用：依 slug 取單一商品，「不限 status」（含隱藏 draft / archived）。
 * 走 getServerSupabase()（per-request、尊重 RLS、讀登入 session），且「不快取」
 * —— 預覽內容必須即時反映後台最新狀態，不可走 anon 公開快取。
 * 對 admin：RLS「admin all products」放行任何 status；對 anon：RLS 僅回 published
 * （但本函式僅在確認為 admin 後才呼叫）。
 */
export const getProductBySlugPreview = async (
  slug: string,
): Promise<Product | null> => {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  throwOnError("getProductBySlugPreview", error);
  return (data as Product | null) ?? null;
};
